import type { Env } from '../types';

const BEARER_RE = /^Bearer\s+(.+)$/i;
const TOKEN_RE = /^[a-zA-Z0-9_-]{16,128}$/;

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization');
  if (!header) return null;
  const match = BEARER_RE.exec(header.trim());
  const token = match?.[1]?.trim() ?? '';
  if (TOKEN_RE.test(token)) return token;
  if (/^[a-f0-9]{32,128}$/i.test(token)) return token;
  return null;
}

export function requireDeviceToken(request: Request): string | Response {
  const token = extractBearerToken(request);
  if (!token) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  return token;
}

export function requireInternalSecret(request: Request, env: Env): boolean {
  const secret = env.CONTAINER_SECRET;
  if (!secret) return false;
  const header = request.headers.get('X-Clippy-Internal') ?? '';
  return header === secret && header.length > 0;
}
