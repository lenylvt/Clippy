/**
 * Public extension release metadata + zip download.
 */

import { withCors } from '../http/cors';
import { errorResponse, jsonResponse } from '../http/responses';
import type { Env } from '../types';
import {
  EXTENSION_ZIP_R2_KEY,
  extensionVersion,
  publicOrigin,
} from './install';

export const EXTENSION_API_PATH = '/api/extension';
export const EXTENSION_ZIP_PATH = '/extension.zip';

export function handleExtensionApi(request: Request, env: Env): Response {
  const origin = publicOrigin(env, request.url);
  const version = extensionVersion(env);
  return jsonResponse(request, env, {
    ok: true,
    version,
    installUrl: `${origin}/install/`,
    zipUrl: `${origin}/extension.zip`,
  });
}

export async function handleExtensionZip(request: Request, env: Env): Promise<Response> {
  const object = await env.CLIPS.get(EXTENSION_ZIP_R2_KEY);
  if (!object) {
    return errorResponse(request, env, 'not_found', 404);
  }

  const headers = new Headers();
  headers.set('Content-Type', 'application/zip');
  headers.set(
    'Content-Disposition',
    'attachment; filename="clippy-extension.zip"',
  );
  headers.set('Cache-Control', 'public, max-age=60');
  headers.set('X-Content-Type-Options', 'nosniff');
  if (object.size != null) {
    headers.set('Content-Length', String(object.size));
  }
  const etag = object.httpEtag || object.etag;
  if (etag) headers.set('ETag', etag);

  return withCors(request, env, new Response(object.body, { status: 200, headers }));
}
