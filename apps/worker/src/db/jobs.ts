import { JOB_TTL_MS } from '../constants';
import type { Env, JobRow } from '../types';

/** Running jobs with no progress for this long are considered stuck. */
export const STALE_JOB_MS = 12 * 60 * 1000;

export async function insertJob(
  env: Env,
  input: {
    id: string;
    videoId: string;
    videoTitle: string;
    youtubeUrl: string;
    clipStart: number;
    clipEnd: number;
    deviceToken: string;
    userId: string;
  },
) {
  const now = Date.now();
  const expiresAt = now + JOB_TTL_MS;
  await env.DB.prepare(
    `INSERT INTO jobs (
      id, status, stage, progress, video_id, video_title, youtube_url,
      clip_start, clip_end, clip_id, error, device_token, slot,
      created_at, updated_at, expires_at, user_id, r2_key
    ) VALUES (?, 'queued', 'queued', 0, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, ?, ?, ?, ?, NULL)`,
  )
    .bind(
      input.id,
      input.videoId,
      input.videoTitle,
      input.youtubeUrl,
      input.clipStart,
      input.clipEnd,
      input.deviceToken,
      now,
      now,
      expiresAt,
      input.userId,
    )
    .run();
  return { createdAt: now, expiresAt };
}

export async function getJobById(env: Env, id: string): Promise<JobRow | null> {
  return env.DB.prepare(`SELECT * FROM jobs WHERE id = ?`).bind(id).first<JobRow>();
}

/**
 * Unconditional patch (used for terminal done/error and admin).
 * Prefer updateJobProgress for mid-run stages so we never resurrect a finished job.
 */
export async function updateJobStage(
  env: Env,
  id: string,
  patch: {
    status?: string;
    stage?: string;
    progress?: number;
    error?: string | null;
    clipId?: string | null;
    slot?: number | null;
    r2Key?: string | null;
  },
) {
  const job = await getJobById(env, id);
  if (!job) return null;

  const status = patch.status ?? job.status;
  const stage = patch.stage ?? job.stage;
  const progress = patch.progress ?? job.progress;
  const error = patch.error === undefined ? job.error : patch.error;
  const clipId = patch.clipId === undefined ? job.clip_id : patch.clipId;
  const slot = patch.slot === undefined ? job.slot : patch.slot;
  const r2Key = patch.r2Key === undefined ? job.r2_key : patch.r2Key;
  const now = Date.now();

  await env.DB.prepare(
    `UPDATE jobs SET status = ?, stage = ?, progress = ?, error = ?, clip_id = ?, slot = ?, r2_key = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(status, stage, progress, error, clipId, slot, r2Key, now, id)
    .run();

  return getJobById(env, id);
}

/** Progress while running only — no-op if job already done/error. */
export async function updateJobProgress(
  env: Env,
  id: string,
  patch: { stage: string; progress: number; slot?: number | null },
): Promise<JobRow | null> {
  const now = Date.now();
  const result = await env.DB.prepare(
    `UPDATE jobs
     SET stage = ?, progress = ?, slot = COALESCE(?, slot), updated_at = ?, error = NULL
     WHERE id = ? AND status = 'running'`,
  )
    .bind(patch.stage, patch.progress, patch.slot ?? null, now, id)
    .run();
  if (!result.meta.changes) return null;
  return getJobById(env, id);
}

export async function listQueuedJobs(env: Env, limit = 20): Promise<JobRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM jobs WHERE status = 'queued' AND expires_at > ? ORDER BY created_at ASC LIMIT ?`,
  )
    .bind(Date.now(), limit)
    .all<JobRow>();
  return results ?? [];
}

export async function countQueuedJobs(env: Env): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) as c FROM jobs WHERE status = 'queued' AND expires_at > ?`,
  )
    .bind(Date.now())
    .first<{ c: number }>();
  return row?.c ?? 0;
}

/**
 * Atomically claim the oldest queued job for a warm slot.
 * Retries on lost races so 100+ concurrent pumps still drain the queue.
 * Returns null only when the queue is empty.
 */
export async function claimNextQueuedJob(env: Env, slot: number): Promise<JobRow | null> {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const queued = await listQueuedJobs(env, 1);
    const candidate = queued[0];
    if (!candidate) return null;

    const now = Date.now();
    const result = await env.DB.prepare(
      `UPDATE jobs
       SET status = 'running', stage = 'preparing', progress = 0.02, slot = ?, error = NULL, updated_at = ?
       WHERE id = ? AND status = 'queued' AND expires_at > ?`,
    )
      .bind(slot, now, candidate.id, now)
      .run();

    if (result.meta.changes) {
      return getJobById(env, candidate.id);
    }
    // Another slot won this row — try the next head of queue.
  }
  return null;
}

export async function listActiveSlots(env: Env): Promise<number[]> {
  const { results } = await env.DB.prepare(
    `SELECT slot FROM jobs WHERE status = 'running' AND slot IS NOT NULL AND expires_at > ?`,
  )
    .bind(Date.now())
    .all<{ slot: number }>();
  return (results ?? []).map((r) => r.slot);
}

export async function listRunningJobs(env: Env): Promise<JobRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM jobs WHERE status = 'running' AND expires_at > ? ORDER BY updated_at ASC`,
  )
    .bind(Date.now())
    .all<JobRow>();
  return results ?? [];
}

export async function listStaleRunningJobs(env: Env, olderThanMs = STALE_JOB_MS): Promise<JobRow[]> {
  const cutoff = Date.now() - olderThanMs;
  const { results } = await env.DB.prepare(
    `SELECT * FROM jobs WHERE status = 'running' AND updated_at < ? AND expires_at > ?`,
  )
    .bind(cutoff, Date.now())
    .all<JobRow>();
  return results ?? [];
}

export async function deleteJobById(env: Env, id: string): Promise<boolean> {
  const result = await env.DB.prepare(`DELETE FROM jobs WHERE id = ?`).bind(id).run();
  return Boolean(result.meta.changes);
}
