import { deleteSession, getSessionUser } from '../db/sessions';
import type { Env, UserRow } from '../types';
import { extractBearerToken } from './bearer';

/** Resolve session Bearer → user, or 401 JSON (caller should wrap with CORS if needed). */
export async function requireSessionUser(
  request: Request,
  env: Env,
): Promise<UserRow | Response> {
  const token = extractBearerToken(request);
  if (!token) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const user = await getSessionUser(env, token);
  if (!user) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  return user;
}

/**
 * Best-effort logout: missing/invalid Bearer is a no-op (route still returns ok).
 * Clients may call logout without a token after local clear.
 */
export async function logoutSession(request: Request, env: Env): Promise<void> {
  const token = extractBearerToken(request);
  if (token) await deleteSession(env, token);
}
