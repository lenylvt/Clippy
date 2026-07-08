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
import { validateUploadPayload } from './validate';
import type { Env } from './types';

type RouteHandler = (request: Request, env: Env, origin: string, params: Record<string, string>) => Promise<Response>;

async function handleUpload(request: Request, env: Env, origin: string) {
  const form = await request.formData();
  const file = form.get('file');

  if (!(file instanceof File)) {
    return jsonResponse({ ok: false, error: 'invalid_payload' }, 400);
  }

  const payload = {
    file,
    videoId: String(form.get('videoId') ?? '').trim(),
    videoTitle: String(form.get('videoTitle') ?? 'Sans titre').trim(),
    youtubeUrl: String(form.get('youtubeUrl') ?? '').trim(),
    clipStart: Number(form.get('clipStart')),
    clipEnd: Number(form.get('clipEnd')),
  };

  const validationError = validateUploadPayload(payload);
  if (validationError) {
    return jsonResponse({ ok: false, error: validationError }, 400);
  }

  const id = createClipId();
  const extension = clipExtensionFromMime(file.type || 'video/webm');
  const r2Key = `clips/${sanitizeR2KeyPart(payload.videoId)}/${id}.${extension}`;

  await env.CLIPS.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type || 'video/webm' },
  });

  try {
    const { createdAt, expiresAt } = await insertClip(env, {
      id,
      videoId: payload.videoId,
      videoTitle: payload.videoTitle,
      youtubeUrl: payload.youtubeUrl,
      r2Key,
      clipStart: payload.clipStart,
      clipEnd: payload.clipEnd,
    });

    return jsonResponse({
      ok: true,
      id,
      url: `${origin}/clips/${id}`,
      galleryUrl: `${origin}/`,
      createdAt,
      expiresAt,
    });
  } catch (error) {
    await env.CLIPS.delete(r2Key);
    throw error;
  }
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

const routes: Array<{
  method: string;
  pattern: RegExp;
  handler: RouteHandler;
}> = [
  {
    method: 'POST',
    pattern: /^\/api\/clips$/,
    handler: (request, env, origin) => handleUpload(request, env, origin),
  },
  {
    method: 'GET',
    pattern: /^\/api\/clips$/,
    handler: (_request, env, origin) => handleApiClips(env, origin),
  },
  {
    method: 'GET',
    pattern: /^\/$/,
    handler: (_request, env, origin) => handleGallery(env, origin),
  },
  {
    method: 'GET',
    pattern: /^\/clips\/([^/]+)$/,
    handler: (_request, env, _origin, params) => handleClipDownload(env, params.id),
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/clips\/([^/]+)$/,
    handler: (_request, env, _origin, params) => handleDeleteClip(env, params.id),
  },
];

function matchRoute(method: string, pathname: string) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = pathname.match(route.pattern);
    if (!match) continue;
    return { handler: route.handler, params: { id: match[1] ?? '' } };
  }
  return null;
}

export async function handleRequest(request: Request, env: Env) {
  const url = new URL(request.url);
  const origin = getOrigin(request);

  if (request.method === 'OPTIONS') {
    return optionsResponse();
  }

  const matched = matchRoute(request.method, url.pathname);
  if (matched) {
    return matched.handler(request, env, origin, matched.params);
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
      console.error('[clippy]', error);
      return jsonResponse({ ok: false, error: 'internal_error' }, 500);
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env) {
    await handleScheduled(env);
  },
};
