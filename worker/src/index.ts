import { deleteClipById, deleteExpiredClips, getClipById, insertClip, listClips } from './db';
import { groupClipsByVideo } from './group';
import { renderGalleryPage } from './gallery';
import { clipExtensionFromMime } from './clip-format';
import {
  createClipId,
  getOrigin,
  jsonResponse,
  optionsResponse,
  sanitizeR2KeyPart,
  textResponse,
  withCors,
} from './http';
import type { Env } from './types';

async function handleUpload(request: Request, env: Env, origin: string) {
  const form = await request.formData();
  const file = form.get('file');
  const videoId = String(form.get('videoId') ?? '').trim();
  const videoTitle = String(form.get('videoTitle') ?? 'Sans titre').trim();
  const youtubeUrl = String(form.get('youtubeUrl') ?? '').trim();
  const clipStart = Number(form.get('clipStart'));
  const clipEnd = Number(form.get('clipEnd'));

  if (!(file instanceof File) || !videoId || !youtubeUrl) {
    return jsonResponse({ ok: false, error: 'invalid_payload' }, 400);
  }

  if (!Number.isFinite(clipStart) || !Number.isFinite(clipEnd) || clipEnd <= clipStart) {
    return jsonResponse({ ok: false, error: 'invalid_range' }, 400);
  }

  const id = createClipId();
  const extension = clipExtensionFromMime(file.type || 'video/webm');
  const r2Key = `clips/${sanitizeR2KeyPart(videoId)}/${id}.${extension}`;

  await env.CLIPS.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type || 'video/webm' },
  });

  const { createdAt, expiresAt } = await insertClip(env, {
    id,
    videoId,
    videoTitle,
    youtubeUrl,
    r2Key,
    clipStart,
    clipEnd,
  });

  return jsonResponse({
    ok: true,
    id,
    url: `${origin}/clips/${id}`,
    galleryUrl: `${origin}/`,
    createdAt,
    expiresAt,
  });
}

async function handleClipDownload(env: Env, id: string) {
  const clip = await getClipById(env, id);
  if (!clip) {
    return jsonResponse({ ok: false, error: 'not_found' }, 404);
  }

  const object = await env.CLIPS.get(clip.r2_key);
  if (!object) {
    return jsonResponse({ ok: false, error: 'missing_file' }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Disposition', `inline; filename="clippy-${id}.${clipExtensionFromMime(headers.get('Content-Type') ?? 'video/webm')}"`);
  headers.set('Cache-Control', 'public, max-age=3600');

  return withCors(new Response(object.body, { headers }));
}

async function handleGallery(env: Env, origin: string) {
  const clips = await listClips(env, origin);
  const groups = groupClipsByVideo(clips);
  return textResponse(renderGalleryPage(groups), 'text/html; charset=utf-8');
}

async function handleApiClips(env: Env, origin: string) {
  const clips = await listClips(env, origin);
  return jsonResponse({ ok: true, videos: groupClipsByVideo(clips) });
}

async function handleDeleteClip(env: Env, id: string) {
  const deleted = await deleteClipById(env, id);
  if (!deleted) {
    return jsonResponse({ ok: false, error: 'not_found' }, 404);
  }
  return jsonResponse({ ok: true });
}

export async function handleRequest(request: Request, env: Env) {
  const url = new URL(request.url);
  const origin = getOrigin(request);

  if (request.method === 'OPTIONS') {
    return optionsResponse();
  }

  if (request.method === 'POST' && url.pathname === '/api/clips') {
    return handleUpload(request, env, origin);
  }

  if (request.method === 'GET' && url.pathname === '/api/clips') {
    return handleApiClips(env, origin);
  }

  if (request.method === 'GET' && url.pathname === '/') {
    return handleGallery(env, origin);
  }

  const clipMatch = url.pathname.match(/^\/clips\/([^/]+)$/);
  if (request.method === 'GET' && clipMatch) {
    return handleClipDownload(env, clipMatch[1]);
  }

  const apiClipMatch = url.pathname.match(/^\/api\/clips\/([^/]+)$/);
  if (request.method === 'DELETE' && apiClipMatch) {
    return handleDeleteClip(env, apiClipMatch[1]);
  }

  return jsonResponse({ ok: false, error: 'not_found' }, 404);
}

export async function handleScheduled(env: Env) {
  await deleteExpiredClips(env);
}

export default {
  async fetch(request: Request, env: Env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'internal_error';
      return jsonResponse({ ok: false, error: message }, 500);
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env) {
    await handleScheduled(env);
  },
};
