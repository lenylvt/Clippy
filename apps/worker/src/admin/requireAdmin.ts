import { timingSafeEqualStr } from '../auth/crypto';
import { extractBearerToken } from '../auth/bearer';
import type { Env } from '../types';

/** Admin dashboard Bearer — separate from CONTAINER_SECRET. */
export function requireAdmin(request: Request, env: Env): boolean {
  const secret = env.ADMIN_SECRET;
  if (typeof secret !== 'string' || secret.length === 0) return false;
  const token = extractBearerToken(request);
  if (!token) return false;
  return timingSafeEqualStr(token, secret);
}
