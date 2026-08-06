import { api, ApiError, type ApiOptions } from './client';
import type { AuthUser, Ok } from './types';

export type { AuthUser };

function normalizeEmail(email: string): string {
  return email.normalize('NFC').trim().toLowerCase();
}

function assertOtpCode(code: string): string {
  const normalized = code.trim();
  if (!/^\d{6}$/.test(normalized)) {
    throw new ApiError({
      kind: 'api',
      code: 'invalid_otp_format',
      message: 'invalid_otp_format',
    });
  }
  return normalized;
}

export function requestOtp(email: string, opts?: Pick<ApiOptions, 'signal' | 'idempotencyKey'>) {
  return api<Ok>('/api/auth/request-otp', {
    method: 'POST',
    body: { email: normalizeEmail(email) },
    signal: opts?.signal,
    idempotencyKey: opts?.idempotencyKey,
  });
}

export async function verifyOtp(
  email: string,
  code: string,
  opts?: Pick<ApiOptions, 'signal' | 'idempotencyKey'>,
) {
  const otp = assertOtpCode(code);
  return api<Ok<{ token: string; user: AuthUser }>>('/api/auth/verify-otp', {
    method: 'POST',
    body: { email: normalizeEmail(email), code: otp },
    signal: opts?.signal,
    idempotencyKey: opts?.idempotencyKey,
  });
}

export function fetchMe(token: string, opts?: Pick<ApiOptions, 'signal'>) {
  return api<Ok<{ user: AuthUser }>>('/api/me', {
    token,
    signal: opts?.signal,
  });
}

/**
 * Best-effort logout. Soft by default (swallows network errors) so sign-out
 * always clears local session.
 */
export async function logout(
  token: string,
  opts?: Pick<ApiOptions, 'signal'> & { soft?: boolean },
): Promise<Ok | null> {
  const soft = opts?.soft ?? true;
  try {
    return await api<Ok>('/api/auth/logout', {
      method: 'POST',
      token,
      signal: opts?.signal,
      retries: soft ? 0 : undefined,
    });
  } catch (err) {
    if (soft) return null;
    throw err;
  }
}
