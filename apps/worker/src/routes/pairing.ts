import { requireDeviceToken } from '../auth/bearer';
import { requireSessionUser } from '../auth/otp';
import {
  ensureDevice,
  getDevice,
  listPairedDevices,
  unlinkDevice,
  unlinkDeviceByPrefix,
} from '../db/devices';
import { claimPairingCode, createPairingCode } from '../db/pairing';
import { jsonResponse } from '../http/responses';
import type { Env } from '../types';

export async function handlePairingStart(request: Request, env: Env) {
  const tokenOrRes = requireDeviceToken(request);
  if (tokenOrRes instanceof Response) {
    return jsonResponse(request, await tokenOrRes.json(), tokenOrRes.status);
  }
  await ensureDevice(env, tokenOrRes);
  const { code, expiresAt } = await createPairingCode(env, tokenOrRes);
  const deepLink = `clippy://pair?code=${encodeURIComponent(code)}`;
  return jsonResponse(request, {
    ok: true,
    code,
    expiresAt,
    deepLink,
  });
}

export async function handlePairingClaim(request: Request, env: Env) {
  const userOrRes = await requireSessionUser(request, env);
  if (userOrRes instanceof Response) {
    return jsonResponse(request, await userOrRes.json(), userOrRes.status);
  }
  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse(request, { ok: false, error: 'invalid_json' }, 400);
  }
  const result = await claimPairingCode(env, String(body.code ?? ''), userOrRes.id);
  if (!result.ok) {
    return jsonResponse(request, { ok: false, error: result.error }, 400);
  }
  return jsonResponse(request, { ok: true, deviceToken: result.deviceToken.slice(0, 8) + '…' });
}

export async function handlePairingStatus(request: Request, env: Env) {
  const tokenOrRes = requireDeviceToken(request);
  if (tokenOrRes instanceof Response) {
    return jsonResponse(request, await tokenOrRes.json(), tokenOrRes.status);
  }
  const device = await getDevice(env, tokenOrRes);
  return jsonResponse(request, {
    ok: true,
    paired: Boolean(device?.user_id),
    pairedAt: device?.paired_at ?? null,
  });
}

export async function handlePairingUnlink(request: Request, env: Env) {
  const tokenOrRes = requireDeviceToken(request);
  if (tokenOrRes instanceof Response) {
    return jsonResponse(request, await tokenOrRes.json(), tokenOrRes.status);
  }
  const ok = await unlinkDevice(env, { deviceToken: tokenOrRes });
  return jsonResponse(request, { ok: true, unpaired: ok });
}

export async function handleMeDevices(request: Request, env: Env) {
  const userOrRes = await requireSessionUser(request, env);
  if (userOrRes instanceof Response) {
    return jsonResponse(request, await userOrRes.json(), userOrRes.status);
  }
  const devices = await listPairedDevices(env, userOrRes.id);
  return jsonResponse(request, {
    ok: true,
    devices: devices.map(({ token: _t, ...rest }) => rest),
  });
}

export async function handleMeDeviceUnlink(request: Request, env: Env, prefix: string) {
  const userOrRes = await requireSessionUser(request, env);
  if (userOrRes instanceof Response) {
    return jsonResponse(request, await userOrRes.json(), userOrRes.status);
  }
  const ok = await unlinkDeviceByPrefix(env, userOrRes.id, prefix);
  if (!ok) {
    return jsonResponse(request, { ok: false, error: 'not_found' }, 404);
  }
  return jsonResponse(request, { ok: true });
}
