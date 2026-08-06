import { api, ApiError, type ApiOptions } from './client';
import type { Clip, Ok } from './types';

export type FetchClipsOpts = Pick<ApiOptions, 'signal'> & {
  /** Server may honor limit/cursor when pagination is available. */
  limit?: number;
  cursor?: string;
};

export function fetchMyClips(token: string, opts: FetchClipsOpts = {}) {
  return api<Ok<{ clips: Clip[]; nextCursor?: string | null }>>('/api/me/clips', {
    token,
    signal: opts.signal,
    query: {
      limit: opts.limit,
      cursor: opts.cursor,
    },
  });
}

/** Client-side lookup until the worker exposes GET /api/clips/:id for sessions. */
export async function getClip(token: string, clipId: string, opts: FetchClipsOpts = {}) {
  const { clips } = await fetchMyClips(token, opts);
  const clip = clips.find((c) => c.id === clipId);
  if (!clip) {
    throw new ApiError({
      kind: 'api',
      code: 'not_found',
      status: 404,
      message: 'not_found',
    });
  }
  return clip;
}

export function deleteClip(
  token: string,
  clipId: string,
  opts?: Pick<ApiOptions, 'signal'>,
) {
  return api<Ok>(`/api/clips/${encodeURIComponent(clipId)}`, {
    method: 'DELETE',
    token,
    signal: opts?.signal,
  });
}
