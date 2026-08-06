import { requireInternalSecret } from '../auth/bearer';
import { stopAllClipSlots } from '../container';
import { deleteOrphanClips } from '../db/clips';
import { getJobById, updateJobProgress, updateJobStage } from '../db/jobs';
import { jsonResponse } from '../http/responses';
import { notifyJobEvent } from '../notify/jobEvent';
import { getJobQueue } from '../queue/JobQueue';
import type { Env } from '../types';

export async function handleInternalStage(request: Request, env: Env, jobId: string) {
  if (!requireInternalSecret(request, env)) {
    return jsonResponse(request, { ok: false, error: 'unauthorized' }, 401);
  }

  let body: { stage?: string; progress?: number; error?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse(request, { ok: false, error: 'invalid_json' }, 400);
  }

  const stage = String(body.stage ?? '');
  const progress = typeof body.progress === 'number' ? body.progress : undefined;

  let updated;
  if (stage === 'error') {
    updated = await updateJobStage(env, jobId, {
      status: 'error',
      stage: 'error',
      progress: progress ?? 1,
      error: body.error ?? null,
      slot: null,
    });
  } else {
    const job = await getJobById(env, jobId);
    if (!job) {
      return jsonResponse(request, { ok: false, error: 'not_found' }, 404);
    }
    // Never overwrite done/error — only mutate still-running jobs.
    updated = await updateJobProgress(env, jobId, {
      stage,
      progress: progress ?? job.progress,
    });
    if (!updated && job.status !== 'running') {
      return jsonResponse(request, { ok: true, ignored: true });
    }
  }

  if (!updated) {
    return jsonResponse(request, { ok: false, error: 'not_found' }, 404);
  }

  void notifyJobEvent(env, updated, stage === 'error' ? 'error' : 'progress');
  return jsonResponse(request, { ok: true });
}

export async function handleInternalStopContainers(request: Request, env: Env) {
  if (!requireInternalSecret(request, env)) {
    return jsonResponse(request, { ok: false, error: 'unauthorized' }, 401);
  }
  const stopped = await stopAllClipSlots(env);
  return jsonResponse(request, { ok: true, stopped });
}

export async function handleInternalPurgeOrphans(request: Request, env: Env) {
  if (!requireInternalSecret(request, env)) {
    return jsonResponse(request, { ok: false, error: 'unauthorized' }, 401);
  }
  const deleted = await deleteOrphanClips(env);
  return jsonResponse(request, { ok: true, deleted });
}

export async function handleInternalResetQueue(request: Request, env: Env) {
  if (!requireInternalSecret(request, env)) {
    return jsonResponse(request, { ok: false, error: 'unauthorized' }, 401);
  }
  const result = await getJobQueue(env).resetQueue();
  return jsonResponse(request, result);
}
