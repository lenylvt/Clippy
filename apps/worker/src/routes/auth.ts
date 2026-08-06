import { logoutSession, requestOtp, requireSessionUser, verifyOtp } from '../auth/otp';
import { jsonResponse } from '../http/responses';
import type { Env } from '../types';

export async function handleRequestOtp(request: Request, env: Env) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse(request, { ok: false, error: 'invalid_json' }, 400);
  }
  const result = await requestOtp(env, String(body.email ?? ''));
  if (!result.ok) {
    return jsonResponse(request, { ok: false, error: result.error }, result.status);
  }
  return jsonResponse(request, { ok: true });
}

export async function handleVerifyOtp(request: Request, env: Env) {
  let body: { email?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse(request, { ok: false, error: 'invalid_json' }, 400);
  }
  const result = await verifyOtp(env, String(body.email ?? ''), String(body.code ?? ''));
  if (!result.ok) {
    return jsonResponse(request, { ok: false, error: result.error }, result.status);
  }
  return jsonResponse(request, {
    ok: true,
    token: result.token,
    user: result.user,
  });
}

export async function handleLogout(request: Request, env: Env) {
  await logoutSession(request, env);
  return jsonResponse(request, { ok: true });
}

export async function handleMe(request: Request, env: Env) {
  const userOrRes = await requireSessionUser(request, env);
  if (userOrRes instanceof Response) {
    return jsonResponse(request, await userOrRes.json(), userOrRes.status);
  }
  return jsonResponse(request, {
    ok: true,
    user: { id: userOrRes.id, email: userOrRes.email },
  });
}
