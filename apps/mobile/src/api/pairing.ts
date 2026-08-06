import { api } from './client';
import type { PairedDevice } from './types';

export function claimPairing(token: string, code: string) {
  return api<{ ok: true }>('/api/pairing/claim', {
    method: 'POST',
    token,
    body: { code },
  });
}

export function fetchMyDevices(token: string) {
  return api<{ ok: true; devices: PairedDevice[] }>('/api/me/devices', { token });
}

export function unlinkDevice(token: string, deviceId: string) {
  return api<{ ok: true }>(`/api/me/devices/${encodeURIComponent(deviceId)}`, {
    method: 'DELETE',
    token,
  });
}
