import { requireSessionUser } from '../auth/otp';
import { deleteClipById, getClipById } from '../db/clips';
import { withCors } from '../http/cors';
import { jsonResponse } from '../http/responses';
import { parseBytesRange } from '../range';
import type { Env } from '../types';

export async function handleClipDownload(request: Request, env: Env, id: string) {
  const clip = await getClipById(env, id);
  if (!clip) {
    return jsonResponse(request, { ok: false, error: 'not_found' }, 404);
  }

  const head = await env.CLIPS.head(clip.r2_key);
  if (!head) {
    return jsonResponse(request, { ok: false, error: 'not_found' }, 404);
  }

  const size = head.size;
  const contentType = head.httpMetadata?.contentType || 'video/mp4';
  const rangeHeader = request.headers.get('Range');
  const parsed = parseBytesRange(rangeHeader, size);

  if (request.method === 'HEAD') {
    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Length', String(parsed ? parsed.length : size));
    headers.set('Cache-Control', 'private, max-age=60, must-revalidate');
    if (parsed) {
      headers.set('Content-Range', `bytes ${parsed.start}-${parsed.end}/${size}`);
      return withCors(request, new Response(null, { status: 206, headers }));
    }
    return withCors(request, new Response(null, { status: 200, headers }));
  }

  if (parsed) {
    const object = await env.CLIPS.get(clip.r2_key, {
      range: { offset: parsed.offset, length: parsed.length },
    });
    if (!object) {
      return jsonResponse(request, { ok: false, error: 'not_found' }, 404);
    }
    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Length', String(parsed.length));
    headers.set('Content-Range', `bytes ${parsed.start}-${parsed.end}/${size}`);
    headers.set('Cache-Control', 'private, max-age=60, must-revalidate');
    headers.set('Content-Disposition', 'inline');
    return withCors(request, new Response(object.body, { status: 206, headers }));
  }

  const object = await env.CLIPS.get(clip.r2_key);
  if (!object) {
    return jsonResponse(request, { ok: false, error: 'not_found' }, 404);
  }

  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Length', String(size));
  headers.set('Content-Disposition', 'inline');
  headers.set('Cache-Control', 'private, max-age=60, must-revalidate');
  return withCors(request, new Response(object.body, { status: 200, headers }));
}

export async function handleDeleteClip(request: Request, env: Env, id: string) {
  const userOrRes = await requireSessionUser(request, env);
  if (userOrRes instanceof Response) {
    return jsonResponse(request, await userOrRes.json(), userOrRes.status);
  }
  const clip = await getClipById(env, id);
  if (!clip || clip.user_id !== userOrRes.id) {
    return jsonResponse(request, { ok: false, error: 'not_found' }, 404);
  }
  const deleted = await deleteClipById(env, id);
  if (!deleted) {
    return jsonResponse(request, { ok: false, error: 'not_found' }, 404);
  }
  return jsonResponse(request, { ok: true });
}
