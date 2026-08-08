import { OTP_FROM_EMAIL, OTP_FROM_NAME, OTP_MAX_ATTEMPTS, OTP_TTL_MS } from '../constants';
import {
  createUser,
  deleteOtp,
  getOtp,
  getUserByEmail,
  upsertOtp,
} from '../db/users';
import { createSession } from '../db/sessions';
import { isReviewAccount, isReviewOtp, reviewOtp } from '../review/auth';
import type { Env, UserRow } from '../types';
import {
  OTP_LENGTH,
  escapeHtml,
  hmacSha256Hex,
  isValidEmail,
  normalizeEmail,
  randomDigits,
  timingSafeEqualStr,
} from './crypto';

/** Re-export session helpers so existing `auth/otp` imports keep working. */
export { logoutSession, requireSessionUser } from './session';

/** Env secrets used by OTP (optional bindings — fail closed if absent). */
export type AuthSecrets = {
  OTP_PEPPER?: string;
  SESSION_SECRET?: string;
  REVIEW_EMAIL?: string;
  REVIEW_OTP?: string;
};

export type AuthEnv = Env & AuthSecrets;

export type AuthError = { ok: false; error: string; status: number };

/** Min delay between OTP emails for the same address (anti-spam / anti-reset). */
export const OTP_REQUEST_COOLDOWN_MS = 60_000;

const OTP_CLIENT_ERROR = 'otp_invalid' as const;

function otpPepper(env: AuthSecrets): string | null {
  const pepper = env.OTP_PEPPER || env.SESSION_SECRET;
  return pepper && pepper.length > 0 ? pepper : null;
}

export async function hashOtpCode(env: AuthSecrets, code: string): Promise<string | null> {
  const pepper = otpPepper(env);
  if (!pepper) return null;
  return hmacSha256Hex(pepper, code);
}

export function otpTtlMinutes(): number {
  return Math.max(1, Math.round(OTP_TTL_MS / 60_000));
}

type OtpRow = { code_hash: string; expires_at: number; attempts: number; created_at: number };

async function getOtpRow(env: Env, email: string): Promise<OtpRow | null> {
  return env.DB.prepare(
    `SELECT code_hash, expires_at, attempts, created_at FROM auth_otps WHERE email = ? COLLATE NOCASE`,
  )
    .bind(email)
    .first<OtpRow>();
}

/** Atomic attempt bump; returns new attempts or null if locked / missing / expired. */
async function bumpOtpAttemptsAtomic(env: Env, email: string): Promise<number | null> {
  const now = Date.now();
  const row = await env.DB.prepare(
    `UPDATE auth_otps SET attempts = attempts + 1
     WHERE email = ? COLLATE NOCASE AND attempts < ? AND expires_at > ?
     RETURNING attempts`,
  )
    .bind(email, OTP_MAX_ATTEMPTS, now)
    .first<{ attempts: number }>();
  return row?.attempts ?? null;
}

async function ensureUser(env: Env, email: string): Promise<UserRow> {
  const existing = await getUserByEmail(env, email);
  if (existing) return existing;
  try {
    return await createUser(env, email);
  } catch (error) {
    // Race: concurrent verify after OTP — UNIQUE(email)
    console.error('createUser race', error instanceof Error ? error.message : 'unknown');
    const again = await getUserByEmail(env, email);
    if (again) return again;
    throw error;
  }
}

function failVerify(detail: string): AuthError {
  console.error('verifyOtp', detail);
  return { ok: false, error: OTP_CLIENT_ERROR, status: 400 };
}

export async function requestOtp(
  env: AuthEnv,
  rawEmail: unknown,
): Promise<{ ok: true } | AuthError> {
  if (typeof rawEmail !== 'string') {
    return { ok: false, error: 'invalid_email', status: 400 };
  }
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) {
    return { ok: false, error: 'invalid_email', status: 400 };
  }

  // App Store review: acknowledge request without sending mail.
  if (isReviewAccount(env, email) && reviewOtp(env)) {
    return { ok: true };
  }

  if (!env.EMAIL) {
    console.error('requestOtp email_not_configured');
    return { ok: false, error: 'service_unavailable', status: 503 };
  }

  if (!otpPepper(env)) {
    console.error('requestOtp missing OTP_PEPPER|SESSION_SECRET');
    return { ok: false, error: 'service_unavailable', status: 503 };
  }

  const now = Date.now();
  const existing = await getOtpRow(env, email);
  if (existing) {
    if (existing.attempts >= OTP_MAX_ATTEMPTS && existing.expires_at > now) {
      console.error('requestOtp locked', email);
      return { ok: false, error: 'rate_limited', status: 429 };
    }
    if (now - existing.created_at < OTP_REQUEST_COOLDOWN_MS) {
      console.error('requestOtp cooldown', email);
      return { ok: false, error: 'rate_limited', status: 429 };
    }
  }

  const code = randomDigits(OTP_LENGTH);
  const codeHash = await hashOtpCode(env, code);
  if (!codeHash) {
    return { ok: false, error: 'service_unavailable', status: 503 };
  }

  const minutes = otpTtlMinutes();
  const safeCode = escapeHtml(code);

  try {
    await env.EMAIL.send({
      from: { email: OTP_FROM_EMAIL, name: OTP_FROM_NAME },
      to: email,
      subject: 'Ton code Clippy',
      text: `Ton code Clippy : ${code}\n\nValable ${minutes} minutes. Si tu n’as rien demandé, ignore cet email.`,
      html: `<p style="font-family:system-ui,sans-serif;font-size:16px">Ton code Clippy :</p>
<p style="font-family:ui-monospace,monospace;font-size:32px;letter-spacing:0.2em;font-weight:600">${safeCode}</p>
<p style="font-family:system-ui,sans-serif;font-size:14px;color:#666">Valable ${minutes} minutes.</p>`,
    });
  } catch (error) {
    console.error('EMAIL.send failed', error instanceof Error ? error.message : 'send_error');
    return { ok: false, error: 'email_send_failed', status: 502 };
  }

  // Persist only after successful send (no orphan OTP if mail fails).
  await upsertOtp(env, email, codeHash);
  return { ok: true };
}

export async function verifyOtp(
  env: AuthEnv,
  rawEmail: unknown,
  rawCode: unknown,
): Promise<
  { ok: true; token: string; user: { id: string; email: string } } | AuthError
> {
  if (typeof rawEmail !== 'string' || typeof rawCode !== 'string') {
    return failVerify('invalid_payload_type');
  }
  const email = normalizeEmail(rawEmail);
  const code = rawCode.trim();
  if (!isValidEmail(email) || !new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code)) {
    return failVerify('invalid_payload');
  }

  // App Store review: fixed OTP, no mail / no auth_otps row.
  if (isReviewOtp(env, email, code)) {
    const user = await ensureUser(env, email);
    const token = await createSession(env, user.id);
    return {
      ok: true,
      token,
      user: { id: user.id, email: normalizeEmail(user.email) },
    };
  }

  if (!otpPepper(env)) {
    console.error('verifyOtp missing OTP_PEPPER|SESSION_SECRET');
    return { ok: false, error: 'service_unavailable', status: 503 };
  }

  const otp = await getOtp(env, email);
  if (!otp) {
    return failVerify('otp_not_found');
  }
  if (otp.expires_at < Date.now()) {
    await deleteOtp(env, email);
    return failVerify('otp_expired');
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await deleteOtp(env, email);
    return failVerify('otp_locked');
  }

  const codeHash = await hashOtpCode(env, code);
  if (!codeHash || !timingSafeEqualStr(codeHash, otp.code_hash)) {
    const attempts = await bumpOtpAttemptsAtomic(env, email);
    if (attempts === null || attempts >= OTP_MAX_ATTEMPTS) {
      await deleteOtp(env, email);
      return failVerify('otp_locked_after_bump');
    }
    return failVerify(`otp_bad_code attempts=${attempts}`);
  }

  await deleteOtp(env, email);
  const user = await ensureUser(env, email);
  const token = await createSession(env, user.id);
  return {
    ok: true,
    token,
    user: { id: user.id, email: normalizeEmail(user.email) },
  };
}
