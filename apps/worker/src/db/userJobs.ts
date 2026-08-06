import type { ClipRow, Env, JobRow } from '../types';

export async function countActiveJobsForUser(env: Env, userId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) as c FROM jobs WHERE user_id = ? AND status IN ('queued', 'running') AND expires_at > ?`,
  )
    .bind(userId, Date.now())
    .first<{ c: number }>();
  return row?.c ?? 0;
}

export async function listJobsForUser(env: Env, userId: string, limit = 50): Promise<JobRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(userId, limit)
    .all<JobRow>();
  return results ?? [];
}

export async function listActiveJobsForUser(env: Env, userId: string): Promise<JobRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM jobs WHERE user_id = ? AND status IN ('queued', 'running') AND expires_at > ?
     ORDER BY created_at ASC`,
  )
    .bind(userId, Date.now())
    .all<JobRow>();
  return results ?? [];
}

export async function listClipsForUser(env: Env, userId: string): Promise<ClipRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM clips WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC`,
  )
    .bind(userId, Date.now())
    .all<ClipRow>();
  return results ?? [];
}
