import { OTP_FROM_EMAIL, OTP_FROM_NAME, OTP_MAX_ATTEMPTS } from '../constants';
import {
  bumpOtpAttempts,
  createUser,
  deleteOtp,
  getOtp,
  getUserByEmail,
  upsertOtp,
} from '../db/users';
import { createSession, deleteSession, getSessionUser } from '../db/sessions';
import { isValidEmail, normalizeEmail, randomDigits, sha256Hex } from './crypto';
import { extractBearerToken } from './bearer';
import type { Env, UserRow } from '../types';

export async function requestOtp(
  env: Env,
  rawEmail: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) {
    return { ok: false, error: 'invalid_email', status: 400 };
  }

  if (!env.EMAIL) {
    return { ok: false, error: 'email_not_configured', status: 503 };
  }

  const code = randomDigits(6);
  const codeHash = await sha256Hex(code);
  await upsertOtp(env, email, codeHash);

  try {
    await env.EMAIL.send({
      from: { email: OTP_FROM_EMAIL, name: OTP_FROM_NAME },
      to: email,
      subject: `${code} — code Clippy`,
      text: `Ton code Clippy : ${code}\n\nValable 10 minutes. Si tu n’as rien demandé, ignore cet email.`,
      html: `<p style="font-family:system-ui,sans-serif;font-size:16px">Ton code Clippy :</p>
<p style="font-family:ui-monospace,monospace;font-size:32px;letter-spacing:0.2em;font-weight:600">${code}</p>
<p style="font-family:system-ui,sans-serif;font-size:14px;color:#666">Valable 10 minutes.</p>`,
    });
  } catch (error) {
    console.error('EMAIL.send failed', error);
    return { ok: false, error: 'email_send_failed', status: 502 };
  }

  return { ok: true };
}

export async function verifyOtp(
  env: Env,
  rawEmail: string,
  rawCode: string,
): Promise<{ ok: true; token: string; user: { id: string; email: string } } | { ok: false; error: string; status: number }> {
  const email = normalizeEmail(rawEmail);
  const code = String(rawCode ?? '').trim();
  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
    return { ok: false, error: 'invalid_payload', status: 400 };
  }

  const otp = await getOtp(env, email);
  if (!otp) {
    return { ok: false, error: 'otp_not_found', status: 400 };
  }
  if (otp.expires_at < Date.now()) {
    await deleteOtp(env, email);
    return { ok: false, error: 'otp_expired', status: 400 };
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await deleteOtp(env, email);
    return { ok: false, error: 'otp_locked', status: 429 };
  }

  const codeHash = await sha256Hex(code);
  if (codeHash !== otp.code_hash) {
    const attempts = await bumpOtpAttempts(env, email);
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await deleteOtp(env, email);
      return { ok: false, error: 'otp_locked', status: 429 };
    }
    return { ok: false, error: 'otp_invalid', status: 400 };
  }

  await deleteOtp(env, email);
  let user = await getUserByEmail(env, email);
  if (!user) {
    user = await createUser(env, email);
  }
  const token = await createSession(env, user.id);
  return { ok: true, token, user: { id: user.id, email: user.email } };
}

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

export async function logoutSession(request: Request, env: Env): Promise<void> {
  const token = extractBearerToken(request);
  if (token) await deleteSession(env, token);
}
