import { cleanYoutubeTitle } from '@clippy/shared/title';
import { validateJobPayload } from '@clippy/shared/validateJob';
import { requireDeviceToken } from '../auth/bearer';
import { ensureDevice } from '../db/devices';
import { insertJob, getJobById } from '../db/jobs';
import { rowToJob } from '../db/mappers';
import { getOrigin } from '../http/cors';
import { createId } from '../http/ids';
import { jsonResponse } from '../http/responses';
import { getJobQueue } from '../queue/JobQueue';
import type { Env } from '../types';

export async function handleCreateJob(request: Request, env: Env) {
  const tokenOrRes = requireDeviceToken(request);
  if (tokenOrRes instanceof Response) {
    return jsonResponse(request, await tokenOrRes.json(), tokenOrRes.status);
  }

  const device = await ensureDevice(env, tokenOrRes);
  if (!device.user_id) {
    return jsonResponse(request, { ok: false, error: 'pairing_required' }, 403);
  }

  let body: {
    videoId?: string;
    videoTitle?: string;
    youtubeUrl?: string;
    clipStart?: number;
    clipEnd?: number;
  };
  try {
    body = await request.json();
  } catch {
    return jsonResponse(request, { ok: false, error: 'invalid_json' }, 400);
  }

  const payload = {
    videoId: String(body.videoId ?? '').trim(),
    videoTitle: cleanYoutubeTitle(String(body.videoTitle ?? 'Sans titre')),
    youtubeUrl: String(body.youtubeUrl ?? '').trim(),
    clipStart: Number(body.clipStart),
    clipEnd: Number(body.clipEnd),
  };

  const validationError = validateJobPayload(payload);
  if (validationError) {
    return jsonResponse(request, { ok: false, error: validationError }, 400);
  }

  const id = createId();
  await insertJob(env, {
    id,
    ...payload,
    deviceToken: tokenOrRes,
    userId: device.user_id,
  });

  const queue = getJobQueue(env);
  await queue.enqueue(id, getOrigin(request));

  return jsonResponse(request, {
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
    return jsonResponse(request, await tokenOrRes.json(), tokenOrRes.status);
  }

  const job = await getJobById(env, jobId);
  if (!job || job.device_token !== tokenOrRes) {
    return jsonResponse(request, { ok: false, error: 'not_found' }, 404);
  }

  return jsonResponse(request, { ok: true, job: rowToJob(job, getOrigin(request)) });
}
