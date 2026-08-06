import { api } from './client';
import type { Clip } from './types';

export function fetchMyClips(token: string) {
  return api<{ ok: true; clips: Clip[] }>('/api/me/clips', { token });
}

export function deleteClip(token: string, clipId: string) {
  return api<{ ok: true }>(`/api/clips/${encodeURIComponent(clipId)}`, {
    method: 'DELETE',
    token,
  });
}
