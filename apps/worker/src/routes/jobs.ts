import { cleanYoutubeTitle } from '@clippy/shared/title';
import { validateJobPayload } from '@clippy/shared/validateJob';
import { requireDeviceToken } from '../auth/bearer';
import { requireSessionUser } from '../auth/otp';
import {
  MAX_ACTIVE_JOBS_PER_USER,
  RATE_LIMIT_CREATE_JOB,
} from '../constants';
import { ensureDevice } from '../db/devices';
import { deleteErrorJobById, insertJob, getJobById } from '../db/jobs';
import { rowToJob } from '../db/mappers';
import { countActiveJobsForUser } from '../db/userJobs';
import { asOptionalNumber, asOptionalString, readJsonObject } from '../http/body';
import { workerOrigin } from '../http/cors';
import { createId, isUuid } from '../http/ids';
import { clientIp, takeRateLimit } from '../http/rateLimit';
import { corsJsonFromResponse, errorResponse, jsonResponse } from '../http/responses';
import { getJobQueue } from '../queue/JobQueue';
import type { Env } from '../types';

export async function handleCreateJob(request: Request, env: Env) {
  const tokenOrRes = requireDeviceToken(request);
  if (tokenOrRes instanceof Response) {
    return corsJsonFromResponse(request, env, tokenOrRes);
  }

  const ip = clientIp(request);
  const limited = takeRateLimit(
    `job:create:${ip}:${tokenOrRes.slice(0, 16)}`,
    RATE_LIMIT_CREATE_JOB.limit,
    RATE_LIMIT_CREATE_JOB.windowMs,
  );
  if (!limited.ok) {
    return errorResponse(request, env, 'rate_limited', 429, {
      retryAfter: limited.retryAfterSec,
    });
  }

  const device = await ensureDevice(env, tokenOrRes);
  if (!device.user_id) {
    return errorResponse(request, env, 'pairing_required', 403);
  }

  const active = await countActiveJobsForUser(env, device.user_id);
  if (active >= MAX_ACTIVE_JOBS_PER_USER) {
    return errorResponse(request, env, 'job_quota_exceeded', 429, {
      active,
      max: MAX_ACTIVE_JOBS_PER_USER,
    });
  }

  const parsed = await readJsonObject(request);
  if (!parsed.ok) {
    return errorResponse(request, env, parsed.error, 400);
  }

  const clipStart = asOptionalNumber(parsed.body.clipStart);
  const clipEnd = asOptionalNumber(parsed.body.clipEnd);
  if (clipStart === undefined || clipEnd === undefined) {
    return errorResponse(request, env, 'invalid_clip_bounds', 400);
  }

  const payload = {
    videoId: (asOptionalString(parsed.body.videoId) ?? '').trim(),
    videoTitle: cleanYoutubeTitle(
      asOptionalString(parsed.body.videoTitle) ?? 'Sans titre',
    ),
    youtubeUrl: (asOptionalString(parsed.body.youtubeUrl) ?? '').trim(),
    clipStart,
    clipEnd,
  };

  const validationError = validateJobPayload(payload);
  if (validationError) {
    return errorResponse(request, env, validationError, 400);
  }

  const id = createId();
  try {
    await insertJob(env, {
      id,
      ...payload,
      deviceToken: tokenOrRes,
      userId: device.user_id,
    });
  } catch (error) {
    console.error('insertJob failed', error);
    return errorResponse(request, env, 'internal_error', 500);
  }

  try {
    const queue = getJobQueue(env);
    await queue.enqueue(id, workerOrigin(request));
  } catch (error) {
    console.error('enqueue failed', id, error);
    // Job row exists as queued — pump/cron can still pick it up; surface soft failure.
    return jsonResponse(request, env, {
      ok: true,
      jobId: id,
      status: 'queued',
      stage: 'queued',
      progress: 0,
      enqueueDeferred: true,
    });
  }

  return jsonResponse(request, env, {
    ok: true,
    jobId: id,
    status: 'queued',
    stage: 'queued',
    progress: 0,
  });
}

export async function handleGetJob(request: Request, env: Env, jobId: string) {
  const tokenOrRes = requireDeviceToken(request);
  if (tokenOrRes instanceof Response) {
    return corsJsonFromResponse(request, env, tokenOrRes);
  }

  if (!isUuid(jobId)) {
    return errorResponse(request, env, 'not_found', 404);
  }

  const job = await getJobById(env, jobId);
  if (!job || job.device_token !== tokenOrRes) {
    return errorResponse(request, env, 'not_found', 404);
  }

  return jsonResponse(request, env, {
    ok: true,
    job: await rowToJob(job, workerOrigin(request), env),
  });
}

/** Dismiss a failed job from home / activity (session owner only). */
export async function handleDeleteJob(request: Request, env: Env, jobId: string) {
  const userOrRes = await requireSessionUser(request, env);
  if (userOrRes instanceof Response) {
    return corsJsonFromResponse(request, env, userOrRes);
  }
  if (!isUuid(jobId)) {
    return errorResponse(request, env, 'not_found', 404);
  }
  const deleted = await deleteErrorJobById(env, jobId, userOrRes.id);
  if (!deleted) {
    return errorResponse(request, env, 'not_found', 404);
  }
  return jsonResponse(request, env, { ok: true });
}
