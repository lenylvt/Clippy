import { logoutSession, requestOtp, requireSessionUser, verifyOtp } from '../auth/otp';
import {
  RATE_LIMIT_OTP_REQUEST,
  RATE_LIMIT_OTP_VERIFY,
} from '../constants';
import { asOptionalString, readJsonObject } from '../http/body';
import { clientIp, takeRateLimit } from '../http/rateLimit';
import { corsJsonFromResponse, errorResponse, jsonResponse } from '../http/responses';
import type { Env } from '../types';

function rateLimited(
  request: Request,
  env: Env,
  key: string,
  limit: number,
  windowMs: number,
) {
  const result = takeRateLimit(key, limit, windowMs);
  if (result.ok) return null;
  return errorResponse(request, env, 'rate_limited', 429, {
    retryAfter: result.retryAfterSec,
  });
}

export async function handleRequestOtp(request: Request, env: Env) {
  const ip = clientIp(request);
  const ipLimit = rateLimited(
    request,
    env,
    `otp:req:ip:${ip}`,
    RATE_LIMIT_OTP_REQUEST.limit,
    RATE_LIMIT_OTP_REQUEST.windowMs,
  );
  if (ipLimit) return ipLimit;

  const parsed = await readJsonObject(request);
  if (!parsed.ok) {
    return errorResponse(request, env, parsed.error, 400);
  }
  const email = asOptionalString(parsed.body.email) ?? '';
  const emailLimit = rateLimited(
    request,
    env,
    `otp:req:email:${email.trim().toLowerCase() || 'empty'}`,
    RATE_LIMIT_OTP_REQUEST.limit,
    RATE_LIMIT_OTP_REQUEST.windowMs,
  );
  if (emailLimit) return emailLimit;

  const result = await requestOtp(env, email);
  if (!result.ok) {
    return errorResponse(request, env, result.error, result.status);
  }
  return jsonResponse(request, env, { ok: true });
}

export async function handleVerifyOtp(request: Request, env: Env) {
  const ip = clientIp(request);
  const ipLimit = rateLimited(
    request,
    env,
    `otp:verify:ip:${ip}`,
    RATE_LIMIT_OTP_VERIFY.limit,
    RATE_LIMIT_OTP_VERIFY.windowMs,
  );
  if (ipLimit) return ipLimit;

  const parsed = await readJsonObject(request);
  if (!parsed.ok) {
    return errorResponse(request, env, parsed.error, 400);
  }
  const email = asOptionalString(parsed.body.email) ?? '';
  const code = asOptionalString(parsed.body.code) ?? '';
  const result = await verifyOtp(env, email, code);
  if (!result.ok) {
    return errorResponse(request, env, result.error, result.status);
  }
  return jsonResponse(request, env, {
    ok: true,
    token: result.token,
    user: result.user,
  });
}

export async function handleLogout(request: Request, env: Env) {
  await logoutSession(request, env);
  return jsonResponse(request, env, { ok: true });
}

export async function handleMe(request: Request, env: Env) {
  const userOrRes = await requireSessionUser(request, env);
  if (userOrRes instanceof Response) {
    return corsJsonFromResponse(request, env, userOrRes);
  }
  return jsonResponse(request, env, {
    ok: true,
    user: { id: userOrRes.id, email: userOrRes.email },
  });
}
