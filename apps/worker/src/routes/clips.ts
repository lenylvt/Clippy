import { extractBearerToken } from '../auth/bearer';
import { requireSessionUser } from '../auth/otp';
import { deleteClipById, getClipById } from '../db/clips';
import { getDevice } from '../db/devices';
import { getSessionUser } from '../db/sessions';
import { withCors } from '../http/cors';
import { clipSigningSecret, verifyClipUrlSignature } from '../http/clipUrl';
import { isUuid } from '../http/ids';
import { corsJsonFromResponse, errorResponse, jsonResponse } from '../http/responses';
import { parseBytesRange } from '../range';
import type { ClipRow, Env } from '../types';

function mediaHeaders(opts: {
  contentType: string;
  size: number;
  length: number;
  range?: { start: number; end: number };
  filename: string;
}): Headers {
  const headers = new Headers();
  headers.set('Content-Type', opts.contentType);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Length', String(opts.length));
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set(
    'Content-Disposition',
    `inline; filename="${opts.filename.replace(/[^a-zA-Z0-9._-]+/g, '_')}"`,
  );
  if (opts.range) {
    headers.set(
      'Content-Range',
      `bytes ${opts.range.start}-${opts.range.end}/${opts.size}`,
    );
  }
  return headers;
}

function rangeUnsatisfiable(request: Request, env: Env, size: number) {
  const headers = new Headers();
  headers.set('Content-Range', `bytes */${size}`);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return withCors(request, env, new Response(null, { status: 416, headers }));
}

/**
 * Allow download when:
 * 1. Valid HMAC query (`exp` + `sig`) — primary path for mobile/extension `clip.url`
 * 2. Session Bearer owning the clip
 * 3. Device Bearer whose paired user owns the clip
 */
async function authorizeClipDownload(
  request: Request,
  env: Env,
  clip: ClipRow,
): Promise<true | Response> {
  const url = new URL(request.url);
  const signed = await verifyClipUrlSignature(
    clip.id,
    url.searchParams.get('exp'),
    url.searchParams.get('sig'),
    clipSigningSecret(env),
  );
  if (signed) return true;

  const token = extractBearerToken(request);
  if (!token) {
    return errorResponse(request, env, 'unauthorized', 401);
  }

  const sessionUser = await getSessionUser(env, token);
  if (sessionUser && clip.user_id === sessionUser.id) return true;

  const device = await getDevice(env, token);
  if (device?.user_id && clip.user_id === device.user_id) return true;

  return errorResponse(request, env, 'unauthorized', 401);
}

export async function handleClipDownload(request: Request, env: Env, id: string) {
  if (!isUuid(id)) {
    return errorResponse(request, env, 'not_found', 404);
  }

  const clip = await getClipById(env, id);
  if (!clip) {
    return errorResponse(request, env, 'not_found', 404);
  }

  const auth = await authorizeClipDownload(request, env, clip);
  if (auth !== true) return auth;

  const head = await env.CLIPS.head(clip.r2_key);
  if (!head) {
    return errorResponse(request, env, 'not_found', 404);
  }

  const size = head.size;
  const contentType = head.httpMetadata?.contentType || 'video/mp4';
  const filename = `clippy-${clip.id}.${clip.r2_key.toLowerCase().endsWith('.webm') ? 'webm' : 'mp4'}`;
  const rangeHeader = request.headers.get('Range');
  const parsed = parseBytesRange(rangeHeader, size);

  // Present Range that is malformed or unsatisfiable → 416 (stricter than ignoring malformed).
  if (rangeHeader && (parsed === null || !parsed.ok)) {
    return rangeUnsatisfiable(request, env, size);
  }

  if (request.method === 'HEAD') {
    if (parsed && parsed.ok) {
      return withCors(
        request,
        env,
        new Response(null, {
          status: 206,
          headers: mediaHeaders({
            contentType,
            size,
            length: parsed.length,
            range: { start: parsed.start, end: parsed.end },
            filename,
          }),
        }),
      );
    }
    return withCors(
      request,
      env,
      new Response(null, {
        status: 200,
        headers: mediaHeaders({ contentType, size, length: size, filename }),
      }),
    );
  }

  if (parsed && parsed.ok) {
    const object = await env.CLIPS.get(clip.r2_key, {
      range: { offset: parsed.offset, length: parsed.length },
    });
    if (!object) {
      return errorResponse(request, env, 'not_found', 404);
    }
    return withCors(
      request,
      env,
      new Response(object.body, {
        status: 206,
        headers: mediaHeaders({
          contentType,
          size,
          length: parsed.length,
          range: { start: parsed.start, end: parsed.end },
          filename,
        }),
      }),
    );
  }

  const object = await env.CLIPS.get(clip.r2_key);
  if (!object) {
    return errorResponse(request, env, 'not_found', 404);
  }

  return withCors(
    request,
    env,
    new Response(object.body, {
      status: 200,
      headers: mediaHeaders({ contentType, size, length: size, filename }),
    }),
  );
}

export async function handleDeleteClip(request: Request, env: Env, id: string) {
  const userOrRes = await requireSessionUser(request, env);
  if (userOrRes instanceof Response) {
    return corsJsonFromResponse(request, env, userOrRes);
  }
  if (!isUuid(id)) {
    return errorResponse(request, env, 'not_found', 404);
  }
  const deleted = await deleteClipById(env, id, userOrRes.id);
  if (!deleted) {
    return errorResponse(request, env, 'not_found', 404);
  }
  return jsonResponse(request, env, { ok: true });
}
