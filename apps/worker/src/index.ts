import { deleteClipById, deleteExpiredClips, getClipById, getJobById, insertJob, listClips, rowToJob, updateJobStage } from './db';
import { groupClipsByVideo } from './group';
import { renderGalleryPage } from './gallery';
import { requireDeviceToken, requireInternalSecret } from './auth';
import { ClipContainer, stopAllClipSlots } from './container';
import { getJobQueue, JobQueue } from './queue';
import {
  createId,
  getOrigin,
  jsonResponse,
  optionsResponse,
  textResponse,
} from './http';
import { validateJobPayload } from './validate';
import type { Env } from './types';

export { ClipContainer, JobQueue };

async function handleCreateJob(request: Request, env: Env) {
  const tokenOrRes = requireDeviceToken(request);
  if (tokenOrRes instanceof Response) {
    return jsonResponse(request, await tokenOrRes.json(), tokenOrRes.status);
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
    videoTitle: String(body.videoTitle ?? 'Sans titre').trim(),
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

async function handleGetJob(request: Request, env: Env, jobId: string) {
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

async function handleInternalStage(request: Request, env: Env, jobId: string) {
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
  const updated = await updateJobStage(env, jobId, {
    stage,
    progress,
    error: body.error ?? null,
    status: stage === 'error' ? 'error' : 'running',
  });

  if (!updated) {
    return jsonResponse(request, { ok: false, error: 'not_found' }, 404);
  }
  return jsonResponse(request, { ok: true });
}

async function handleInternalStopContainers(request: Request, env: Env) {
  if (!requireInternalSecret(request, env)) {
    return jsonResponse(request, { ok: false, error: 'unauthorized' }, 401);
  }
  const stopped = await stopAllClipSlots(env);
  return jsonResponse(request, { ok: true, stopped });
}

async function handleApiClips(request: Request, env: Env) {
  const origin = getOrigin(request);
  const clips = await listClips(env, origin);
  return jsonResponse(request, { ok: true, videos: groupClipsByVideo(clips) });
}

async function handleGallery(request: Request, env: Env) {
  const origin = getOrigin(request);
  const clips = await listClips(env, origin);
  const html = renderGalleryPage(groupClipsByVideo(clips));
  return textResponse(request, html, 'text/html; charset=utf-8');
}

async function handleClipDownload(request: Request, env: Env, id: string) {
  const clip = await getClipById(env, id);
  if (!clip) {
    return jsonResponse(request, { ok: false, error: 'not_found' }, 404);
  }

  const object = await env.CLIPS.get(clip.r2_key);
  if (!object) {
    return jsonResponse(request, { ok: false, error: 'not_found' }, 404);
  }

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'video/mp4');
  headers.set('Content-Disposition', 'inline');
  headers.set('Cache-Control', 'public, max-age=3600');
  if (object.size != null) headers.set('Content-Length', String(object.size));

  return new Response(object.body, { status: 200, headers });
}

async function handleDeleteClip(request: Request, env: Env, id: string) {
  const deleted = await deleteClipById(env, id);
  if (!deleted) {
    return jsonResponse(request, { ok: false, error: 'not_found' }, 404);
  }
  return jsonResponse(request, { ok: true });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return optionsResponse(request);
    }

    const url = new URL(request.url);
    const { pathname } = url;

    try {
      if (request.method === 'POST' && pathname === '/api/jobs') {
        return await handleCreateJob(request, env);
      }

      const jobMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
      if (request.method === 'GET' && jobMatch) {
        return await handleGetJob(request, env, jobMatch[1]!);
      }

      const stageMatch = pathname.match(/^\/api\/internal\/jobs\/([^/]+)$/);
      if (request.method === 'PATCH' && stageMatch) {
        return await handleInternalStage(request, env, stageMatch[1]!);
      }

      if (request.method === 'POST' && pathname === '/api/internal/stop-containers') {
        return await handleInternalStopContainers(request, env);
      }

      if (request.method === 'GET' && pathname === '/api/clips') {
        return await handleApiClips(request, env);
      }

      if (request.method === 'GET' && pathname === '/') {
        return await handleGallery(request, env);
      }

      const clipMatch = pathname.match(/^\/clips\/([^/]+)$/);
      if (request.method === 'GET' && clipMatch) {
        return await handleClipDownload(request, env, clipMatch[1]!);
      }

      const deleteMatch = pathname.match(/^\/api\/clips\/([^/]+)$/);
      if (request.method === 'DELETE' && deleteMatch) {
        return await handleDeleteClip(request, env, deleteMatch[1]!);
      }

      return jsonResponse(request, { ok: false, error: 'not_found' }, 404);
    } catch (error) {
      console.error('worker error', error);
      return jsonResponse(
        request,
        { ok: false, error: error instanceof Error ? error.message : 'internal_error' },
        500,
      );
    }
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await deleteExpiredClips(env);
  },
};
