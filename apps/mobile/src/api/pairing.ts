import { extractPairingCode } from '@clippy/shared/pairing';
import { api, type ApiOptions } from './client';
import type { Ok, PairedDevice } from './types';

/** Normalize QR / deep-link / typed codes before claim. */
export function normalizeClaimCode(code: string): string {
  return extractPairingCode(code) ?? code.trim().toUpperCase();
}

export function claimPairing(
  token: string,
  code: string,
  opts?: Pick<ApiOptions, 'signal' | 'idempotencyKey'>,
) {
  return api<Ok<{ deviceToken: string }>>('/api/pairing/claim', {
    method: 'POST',
    token,
    body: { code: normalizeClaimCode(code) },
    signal: opts?.signal,
    idempotencyKey: opts?.idempotencyKey,
  });
}

export function fetchMyDevices(token: string, opts?: Pick<ApiOptions, 'signal'>) {
  return api<Ok<{ devices: PairedDevice[] }>>('/api/me/devices', {
    token,
    signal: opts?.signal,
  });
}

export function unlinkDevice(
  token: string,
  deviceId: string,
  opts?: Pick<ApiOptions, 'signal'>,
) {
  return api<Ok>(`/api/me/devices/${encodeURIComponent(deviceId)}`, {
    method: 'DELETE',
    token,
    signal: opts?.signal,
  });
}
