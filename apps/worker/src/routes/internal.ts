import { isJobStage } from '@clippy/shared/stages';
import { requireInternalSecret } from '../auth/bearer';
import { ERROR_MESSAGE_MAX } from '../constants';
import { stopAllClipSlots } from '../container';
import { deleteOrphanClips } from '../db/clips';
import { getJobById, updateJobProgress, updateJobStage } from '../db/jobs';
import { asOptionalNumber, asOptionalString, readJsonObject } from '../http/body';
import { isUuid } from '../http/ids';
import { errorResponse, jsonResponse } from '../http/responses';
import { getJobQueue } from '../queue/JobQueue';
import { seedAppStoreReview } from '../review/seed';
import type { Env } from '../types';

function clampProgress(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function truncateError(value: string | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > ERROR_MESSAGE_MAX
    ? trimmed.slice(0, ERROR_MESSAGE_MAX)
    : trimmed;
}

export async function handleInternalStage(
  request: Request,
  env: Env,
  jobId: string,
  _ctx?: ExecutionContext,
) {
  if (!requireInternalSecret(request, env)) {
    return errorResponse(request, env, 'unauthorized', 401);
  }

  if (!isUuid(jobId)) {
    return errorResponse(request, env, 'not_found', 404);
  }

  const parsed = await readJsonObject(request);
  if (!parsed.ok) {
    return errorResponse(request, env, parsed.error, 400);
  }

  const stageRaw = asOptionalString(parsed.body.stage) ?? '';
  if (!isJobStage(stageRaw)) {
    return errorResponse(request, env, 'invalid_stage', 400);
  }

  const progressRaw = parsed.body.progress;
  let progress: number | undefined;
  if (progressRaw !== undefined) {
    const n = asOptionalNumber(progressRaw);
    if (n === undefined) {
      return errorResponse(request, env, 'invalid_progress', 400);
    }
    progress = clampProgress(n);
  }

  if (stageRaw === 'error') {
    const existing = await getJobById(env, jobId);
    if (!existing) {
      return errorResponse(request, env, 'not_found', 404);
    }
    if (existing.status === 'done' || existing.status === 'error') {
      // Never overwrite a terminal job (especially done → error).
      return jsonResponse(request, env, { ok: true, ignored: true });
    }

    const updated = await updateJobStage(env, jobId, {
      status: 'error',
      stage: 'error',
      progress: progress ?? existing.progress,
      error: truncateError(asOptionalString(parsed.body.error)),
      slot: null,
    });
    if (!updated) {
      // Race: became terminal between read and write.
      return jsonResponse(request, env, { ok: true, ignored: true });
    }
    return jsonResponse(request, env, { ok: true });
  }

  if (stageRaw === 'done') {
    // Terminal success is owned by JobQueue after R2 commit — reject here.
    return errorResponse(request, env, 'invalid_stage', 400);
  }

  const job = await getJobById(env, jobId);
  if (!job) {
    return errorResponse(request, env, 'not_found', 404);
  }

  const updated = await updateJobProgress(env, jobId, {
    stage: stageRaw,
    progress: progress ?? job.progress,
  });
  if (!updated) {
    if (job.status !== 'running') {
      return jsonResponse(request, env, { ok: true, ignored: true });
    }
    return errorResponse(request, env, 'not_found', 404);
  }

  return jsonResponse(request, env, { ok: true });
}

export async function handleInternalStopContainers(request: Request, env: Env) {
  if (!requireInternalSecret(request, env)) {
    return errorResponse(request, env, 'unauthorized', 401);
  }
  console.log('internal stop-containers');
  const stopped = await stopAllClipSlots(env);
  return jsonResponse(request, env, { ok: true, stopped });
}

export async function handleInternalPurgeOrphans(request: Request, env: Env) {
  if (!requireInternalSecret(request, env)) {
    return errorResponse(request, env, 'unauthorized', 401);
  }
  console.log('internal purge-orphans');
  const deleted = await deleteOrphanClips(env);
  return jsonResponse(request, env, { ok: true, deleted });
}

export async function handleInternalResetQueue(request: Request, env: Env) {
  if (!requireInternalSecret(request, env)) {
    return errorResponse(request, env, 'unauthorized', 401);
  }
  console.log('internal reset-queue');
  const result = await getJobQueue(env).resetQueue();
  return jsonResponse(request, env, {
    ok: true,
    stopped: result.stopped,
    failedRunning: result.failedRunning,
  });
}

/** Idempotent App Store review fixtures (OTP bypass account + demo jobs/clip). */
export async function handleInternalSeedReview(request: Request, env: Env) {
  if (!requireInternalSecret(request, env)) {
    return errorResponse(request, env, 'unauthorized', 401);
  }
  console.log('internal seed-review');
  const result = await seedAppStoreReview(env);
  if (!result.ok) {
    return errorResponse(request, env, result.error, 400);
  }
  return jsonResponse(request, env, result);
}
