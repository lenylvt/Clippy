import type { Env } from '../types';
import { timingSafeEqualStr } from './crypto';

/**
 * Token formats (same Authorization: Bearer scheme; distinguish by usage site):
 * - Session: 64 hex chars (`randomToken(32)` → sha256 stored in `sessions`)
 * - Device: 64 hex chars (client UUID concat) stored in `devices.device_token`
 * Prefer keeping namespaces documented here; prefixes (`ses_` / `dev_`) would be a
 * coordinated client+server migration.
 */
const BEARER_RE = /^Bearer\s+(.+)$/i;
/** Session + device tokens today: 32–128 of url-safe / hex charset. */
const TOKEN_RE = /^[a-zA-Z0-9_-]{16,128}$/;

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization');
  if (!header) return null;
  const match = BEARER_RE.exec(header.trim());
  const token = match?.[1]?.trim() ?? '';
  if (!TOKEN_RE.test(token)) return null;
  return token;
}

/** Device identity Bearer (format only — existence checked downstream). */
export function requireDeviceToken(request: Request): string | Response {
  const token = extractBearerToken(request);
  if (!token) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  return token;
}

/** Internal container/worker secret via `X-Clippy-Internal` (constant-time). */
export function requireInternalSecret(request: Request, env: Env): boolean {
  const secret = env.CONTAINER_SECRET;
  if (!secret) return false;
  const header = request.headers.get('X-Clippy-Internal') ?? '';
  return timingSafeEqualStr(header, secret);
}
