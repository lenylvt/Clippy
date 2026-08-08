import { OTP_LENGTH, normalizeEmail } from '../auth/crypto';

/** Optional App Store review bypass — set via wrangler secrets. */
export type ReviewAuthEnv = {
  REVIEW_EMAIL?: string;
  REVIEW_OTP?: string;
};

export function reviewEmail(env: ReviewAuthEnv): string | null {
  const raw = env.REVIEW_EMAIL?.trim();
  if (!raw) return null;
  return normalizeEmail(raw);
}

export function reviewOtp(env: ReviewAuthEnv): string | null {
  const raw = env.REVIEW_OTP?.trim();
  if (!raw) return null;
  if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(raw)) return null;
  return raw;
}

export function isReviewAccount(env: ReviewAuthEnv, email: string): boolean {
  const configured = reviewEmail(env);
  return configured != null && email === configured;
}

export function isReviewOtp(env: ReviewAuthEnv, email: string, code: string): boolean {
  const otp = reviewOtp(env);
  if (!otp || !isReviewAccount(env, email)) return false;
  return code === otp;
}
