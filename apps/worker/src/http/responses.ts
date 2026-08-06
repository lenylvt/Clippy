import { withCors, type CorsEnv } from './cors';

export function jsonResponse(request: Request, env: CorsEnv, data: unknown, status = 200) {
  return withCors(
    request,
    env,
    Response.json(data, {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }),
  );
}

/** Uniform API error shape `{ ok: false, error }`. */
export function errorResponse(
  request: Request,
  env: CorsEnv,
  error: string,
  status: number,
  extra?: Record<string, unknown>,
) {
  return jsonResponse(request, env, { ok: false, error, ...extra }, status);
}

/**
 * Re-wrap a bare `Response.json` from auth helpers with CORS via {@link jsonResponse}.
 */
export async function corsJsonFromResponse(
  request: Request,
  env: CorsEnv,
  response: Response,
) {
  let data: unknown = { ok: false, error: 'unauthorized' };
  try {
    data = await response.json();
  } catch {
    /* keep default */
  }
  return jsonResponse(request, env, data, response.status);
}
