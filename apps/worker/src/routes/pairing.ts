import { extractPairingCode } from '@clippy/shared/pairing';
import { requireDeviceToken } from '../auth/bearer';
import { requireSessionUser } from '../auth/otp';
import {
  PAIRING_DEEP_LINK_PREFIX,
  RATE_LIMIT_PAIRING_CLAIM,
  RATE_LIMIT_PAIRING_START,
} from '../constants';
import {
  ensureDevice,
  getDevice,
  listPairedDevices,
  unlinkDevice,
  unlinkDeviceByPrefix,
} from '../db/devices';
import { claimPairingCode, createPairingCode } from '../db/pairing';
import { asOptionalString, readJsonObject } from '../http/body';
import { clientIp, takeRateLimit } from '../http/rateLimit';
import { corsJsonFromResponse, errorResponse, jsonResponse } from '../http/responses';
import type { Env } from '../types';

function claimStatus(error: string): number {
  switch (error) {
    case 'code_expired':
      return 410;
    case 'code_used':
    case 'device_linked_elsewhere':
      return 409;
    case 'invalid_code':
    default:
      return 400;
  }
}

export async function handlePairingStart(request: Request, env: Env) {
  const tokenOrRes = requireDeviceToken(request);
  if (tokenOrRes instanceof Response) {
    return corsJsonFromResponse(request, env, tokenOrRes);
  }

  const limited = takeRateLimit(
    `pairing:start:${clientIp(request)}:${tokenOrRes.slice(0, 16)}`,
    RATE_LIMIT_PAIRING_START.limit,
    RATE_LIMIT_PAIRING_START.windowMs,
  );
  if (!limited.ok) {
    return errorResponse(request, env, 'rate_limited', 429, {
      retryAfter: limited.retryAfterSec,
    });
  }

  await ensureDevice(env, tokenOrRes);
  const { code, expiresAt } = await createPairingCode(env, tokenOrRes);
  const deepLink = `${PAIRING_DEEP_LINK_PREFIX}${encodeURIComponent(code)}`;
  return jsonResponse(request, env, {
    ok: true,
    code,
    expiresAt,
    deepLink,
  });
}

export async function handlePairingClaim(request: Request, env: Env) {
  const userOrRes = await requireSessionUser(request, env);
  if (userOrRes instanceof Response) {
    return corsJsonFromResponse(request, env, userOrRes);
  }

  const limited = takeRateLimit(
    `pairing:claim:${clientIp(request)}:${userOrRes.id}`,
    RATE_LIMIT_PAIRING_CLAIM.limit,
    RATE_LIMIT_PAIRING_CLAIM.windowMs,
  );
  if (!limited.ok) {
    return errorResponse(request, env, 'rate_limited', 429, {
      retryAfter: limited.retryAfterSec,
    });
  }

  const parsed = await readJsonObject(request);
  if (!parsed.ok) {
    return errorResponse(request, env, parsed.error, 400);
  }

  const rawCode = asOptionalString(parsed.body.code) ?? '';
  const code = extractPairingCode(rawCode);
  if (!code) {
    return errorResponse(request, env, 'invalid_code', 400);
  }

  const result = await claimPairingCode(env, code, userOrRes.id);
  if (!result.ok) {
    return errorResponse(request, env, result.error, claimStatus(result.error));
  }
  return jsonResponse(request, env, { ok: true });
}

export async function handlePairingStatus(request: Request, env: Env) {
  const tokenOrRes = requireDeviceToken(request);
  if (tokenOrRes instanceof Response) {
    return corsJsonFromResponse(request, env, tokenOrRes);
  }
  const device = await getDevice(env, tokenOrRes);
  return jsonResponse(request, env, {
    ok: true,
    paired: Boolean(device?.user_id),
    pairedAt: device?.paired_at ?? null,
  });
}

export async function handlePairingUnlink(request: Request, env: Env) {
  const tokenOrRes = requireDeviceToken(request);
  if (tokenOrRes instanceof Response) {
    return corsJsonFromResponse(request, env, tokenOrRes);
  }
  const ok = await unlinkDevice(env, { deviceToken: tokenOrRes });
  return jsonResponse(request, env, { ok: true, unpaired: ok });
}

export async function handleMeDevices(request: Request, env: Env) {
  const userOrRes = await requireSessionUser(request, env);
  if (userOrRes instanceof Response) {
    return corsJsonFromResponse(request, env, userOrRes);
  }
  const devices = await listPairedDevices(env, userOrRes.id);
  // `id` is stable device_id from DB (never token prefix when device_id set).
  return jsonResponse(request, env, {
    ok: true,
    devices: devices.map(({ token: _t, ...rest }) => rest),
  });
}

export async function handleMeDeviceUnlink(request: Request, env: Env, idOrToken: string) {
  const userOrRes = await requireSessionUser(request, env);
  if (userOrRes instanceof Response) {
    return corsJsonFromResponse(request, env, userOrRes);
  }
  const ok = await unlinkDeviceByPrefix(env, userOrRes.id, idOrToken);
  if (!ok) {
    return errorResponse(request, env, 'not_found', 404);
  }
  return jsonResponse(request, env, { ok: true });
}
