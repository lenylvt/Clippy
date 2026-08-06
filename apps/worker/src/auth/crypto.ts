/** Crypto / random helpers for auth (OTP, sessions, pairing, emails). */

import { timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto';

const encoder = new TextEncoder();

const HEX = '0123456789abcdef';

/** OTP digit count — keep in sync with verify regex. */
export const OTP_LENGTH = 6;

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    out += HEX[b >> 4]! + HEX[b & 0xf]!;
  }
  return out;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

/** HMAC-SHA256 hex — pepper OTP codes before storage. */
export async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return bytesToHex(new Uint8Array(sig));
}

/**
 * Uniform decimal digits via rejection sampling (no modulo bias).
 * OTP entropy is intentionally low (~20 bits for 6 digits) — mitigate with pepper + rate limits.
 */
export function randomDigits(length: number): string {
  if (!Number.isInteger(length) || length < 1 || length > 32) {
    throw new RangeError('randomDigits: length must be 1..32');
  }
  const out: string[] = [];
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    for (const b of bytes) {
      if (b >= 250) continue; // reject 250–255
      out.push(String(b % 10));
      if (out.length >= length) break;
    }
  }
  return out.join('');
}

/** Hex token (2 chars per entropy byte). Session tokens use 32 bytes → 64 hex chars. */
export function randomToken(bytes = 32): string {
  if (!Number.isInteger(bytes) || bytes < 1 || bytes > 64) {
    throw new RangeError('randomToken: bytes must be 1..64');
  }
  return bytesToHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

/**
 * Short uppercase pairing code (no ambiguous chars).
 * Alphabet length 32 is a power of two → `b % 32` is unbiased over 0–255.
 */
export function randomPairingCode(length = 8): string {
  if (!Number.isInteger(length) || length < 4 || length > 16) {
    throw new RangeError('randomPairingCode: length must be 4..16');
  }
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[(bytes[i] ?? 0) % alphabet.length] ?? 'A';
  }
  return out;
}

export function normalizeEmail(email: string): string {
  return email.normalize('NFC').trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  if (email.length < 5 || email.length > 254) return false;
  if (/[\u0000-\u001f\u007f]/.test(email)) return false;
  // Local + domain with at least one dot in domain; no spaces.
  return /^[a-z0-9](?:[a-z0-9._+-]*[a-z0-9])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(
    email,
  );
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Constant-time equality for UTF-8 strings of equal length; false if lengths differ. */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  if (ab.byteLength !== bb.byteLength) return false;
  return nodeTimingSafeEqual(ab, bb);
}
