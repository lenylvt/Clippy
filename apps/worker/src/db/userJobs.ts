import { DEFAULT_CLIPS_PAGE_LIMIT, DEFAULT_JOBS_PAGE_LIMIT } from '../constants';
import type { ClipRow, Env, JobRow } from '../types';

const JOB_COLUMNS = `id, status, stage, progress, video_id, video_title, youtube_url,
  clip_start, clip_end, clip_id, error, device_token, user_id, slot, r2_key,
  attempts, origin, created_at, updated_at, expires_at`;

const CLIP_COLUMNS = `id, video_id, video_title, youtube_url, r2_key,
  clip_start, clip_end, created_at, expires_at, user_id, video_duration`;

/**
 * Active (queued|running, not expired) job count for a user.
 * Exported for enqueue quota — wire from routes when capping concurrency.
 */
export async function countActiveJobsForUser(env: Env, userId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) as c FROM jobs
     WHERE user_id = ? AND status IN ('queued', 'running') AND expires_at > ?`,
  )
    .bind(userId, Date.now())
    .first<{ c: number }>();
  return row?.c ?? 0;
}

export async function listJobsForUser(
  env: Env,
  userId: string,
  limit = DEFAULT_JOBS_PAGE_LIMIT,
): Promise<JobRow[]> {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const { results } = await env.DB.prepare(
    `SELECT ${JOB_COLUMNS} FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(userId, safeLimit)
    .all<JobRow>();
  return results ?? [];
}

export async function listActiveJobsForUser(env: Env, userId: string): Promise<JobRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT ${JOB_COLUMNS} FROM jobs
     WHERE user_id = ? AND status IN ('queued', 'running') AND expires_at > ?
     ORDER BY created_at ASC`,
  )
    .bind(userId, Date.now())
    .all<JobRow>();
  return results ?? [];
}

export async function listClipsForUser(
  env: Env,
  userId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<ClipRow[]> {
  const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_CLIPS_PAGE_LIMIT, 100));
  const offset = Math.max(0, opts.offset ?? 0);
  const { results } = await env.DB.prepare(
    `SELECT ${CLIP_COLUMNS} FROM clips
     WHERE user_id = ? AND expires_at > ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(userId, Date.now(), limit, offset)
    .all<ClipRow>();
  return results ?? [];
}
