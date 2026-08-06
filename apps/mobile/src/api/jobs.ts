import { api } from './client';
import type { Job } from './types';

export function fetchMyJobs(token: string, activeOnly = false) {
  const q = activeOnly ? '?active=1' : '';
  return api<{ ok: true; jobs: Job[] }>(`/api/me/jobs${q}`, { token });
}
