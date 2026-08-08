import { timingSafeEqualStr } from '../auth/crypto';
import type { Env } from '../types';

export const ADMIN_COOKIE = 'clippy_admin';
const ADMIN_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

const BEARER_RE = /^Bearer\s+(.+)$/i;

/** Admin secrets are free-form — not constrained by session/device TOKEN_RE. */
export function extractAdminCredential(request: Request): string | null {
  const header = request.headers.get('Authorization');
  if (header) {
    const match = BEARER_RE.exec(header.trim());
    const token = match?.[1]?.trim() ?? '';
    if (token.length > 0 && token.length <= 256) return token;
  }
  return readCookie(request, ADMIN_COOKIE);
}

export function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get('Cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (key !== name) continue;
    const value = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

export function adminCookieHeader(secret: string): string {
  const encoded = encodeURIComponent(secret);
  return [
    `${ADMIN_COOKIE}=${encoded}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${ADMIN_COOKIE_MAX_AGE_SEC}`,
  ].join('; ');
}

export function clearAdminCookieHeader(): string {
  return [
    `${ADMIN_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=0',
  ].join('; ');
}

/** Admin dashboard auth — Bearer or HttpOnly cookie. */
export function requireAdmin(request: Request, env: Env): boolean {
  const secret = env.ADMIN_SECRET;
  if (typeof secret !== 'string' || secret.length === 0) return false;
  const token = extractAdminCredential(request);
  if (!token) return false;
  return timingSafeEqualStr(token, secret);
}
