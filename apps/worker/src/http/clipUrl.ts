/**
 * HMAC-signed clip download URLs (query `exp` + `sig`).
 * Lets mobile/extension stream `clip.url` without Authorization headers.
 */

import { hmacSha256Hex, timingSafeEqualStr } from '../auth/crypto';
import { CLIP_TTL_MS } from '../constants';

export const CLIP_URL_EXP_PARAM = 'exp';
export const CLIP_URL_SIG_PARAM = 'sig';

export type ClipSignEnv = {
  CONTAINER_SECRET: string;
  SESSION_SECRET?: string;
};

/** Prefer SESSION_SECRET when set; fall back to CONTAINER_SECRET (always required). */
export function clipSigningSecret(env: ClipSignEnv): string {
  const session = env.SESSION_SECRET?.trim();
  if (session) return session;
  return env.CONTAINER_SECRET;
}

export async function signClipPayload(
  secret: string,
  clipId: string,
  expiresAtMs: number,
): Promise<string> {
  const exp = Math.floor(expiresAtMs);
  return hmacSha256Hex(secret, `clip:${clipId}:${exp}`);
}

/** Absolute signed GET URL valid until `expiresAtMs` (usually clip.expires_at). */
export async function buildSignedClipUrl(
  origin: string,
  clipId: string,
  secret: string,
  expiresAtMs: number,
): Promise<string> {
  const base = origin.replace(/\/+$/, '');
  const exp = Math.floor(expiresAtMs);
  const sig = await signClipPayload(secret, clipId, exp);
  const q = new URLSearchParams({
    [CLIP_URL_EXP_PARAM]: String(exp),
    [CLIP_URL_SIG_PARAM]: sig,
  });
  return `${base}/clips/${encodeURIComponent(clipId)}?${q}`;
}

/** Default expiry when caller has no clip row TTL (e.g. push notify). */
export function defaultClipUrlExpiry(now = Date.now()): number {
  return now + CLIP_TTL_MS;
}

export async function verifyClipUrlSignature(
  clipId: string,
  expRaw: string | null,
  sigRaw: string | null,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  if (!expRaw || !sigRaw) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || !Number.isInteger(exp) || exp <= now) return false;
  if (!/^[a-f0-9]{64}$/i.test(sigRaw)) return false;
  const expected = await signClipPayload(secret, clipId, exp);
  return timingSafeEqualStr(expected.toLowerCase(), sigRaw.toLowerCase());
}
