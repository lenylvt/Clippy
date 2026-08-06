import {
  CLAIM_DEADLINE_MS,
  CLAIM_MAX_ATTEMPTS,
  ERROR_MESSAGE_MAX,
  JOB_TTL_MS,
  MAX_JOB_ATTEMPTS,
  STALE_JOB_MS,
} from '../constants';
import type { Env, JobRow } from '../types';
import { allowedStatusesForJobPatch } from './mappers';

/** Explicit projection — avoid SELECT * on hot list/claim paths. */
const JOB_COLUMNS = `id, status, stage, progress, video_id, video_title, youtube_url,
  clip_start, clip_end, clip_id, error, device_token, user_id, slot, r2_key,
  attempts, origin, created_at, updated_at, expires_at`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  return env.DB.prepare(`SELECT ${JOB_COLUMNS} FROM jobs WHERE id = ?`).bind(id).first<JobRow>();
}

/**
 * Delete a failed job owned by the user (dismiss from home / activity).
 * Only `error` status — never cancel in-flight work via this path.
 */
export async function deleteErrorJobById(
  env: Env,
  id: string,
  userId: string,
): Promise<boolean> {
  const result = await env.DB.prepare(
    `DELETE FROM jobs WHERE id = ? AND user_id = ? AND status = 'error'`,
  )
    .bind(id, userId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/**
 * Conditional job patch — never resurrects done/error or flips done↔error.
 * Aligns with updateJobProgress: WHERE status must match the transition.
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
): Promise<JobRow | null> {
  const allowed = allowedStatusesForJobPatch(patch.status);
  const placeholders = allowed.map(() => '?').join(', ');
  const now = Date.now();

  const result = await env.DB.prepare(
    `UPDATE jobs SET
       status = COALESCE(?, status),
       stage = COALESCE(?, stage),
       progress = COALESCE(?, progress),
       error = CASE WHEN ? = 1 THEN ? ELSE error END,
       clip_id = CASE WHEN ? = 1 THEN ? ELSE clip_id END,
       slot = CASE WHEN ? = 1 THEN ? ELSE slot END,
       r2_key = CASE WHEN ? = 1 THEN ? ELSE r2_key END,
       updated_at = ?
     WHERE id = ? AND status IN (${placeholders})
     RETURNING ${JOB_COLUMNS}`,
  )
    .bind(
      patch.status ?? null,
      patch.stage ?? null,
      patch.progress ?? null,
      patch.error === undefined ? 0 : 1,
      patch.error ?? null,
      patch.clipId === undefined ? 0 : 1,
      patch.clipId ?? null,
      patch.slot === undefined ? 0 : 1,
      patch.slot ?? null,
      patch.r2Key === undefined ? 0 : 1,
      patch.r2Key ?? null,
      now,
      id,
      ...allowed,
    )
    .first<JobRow>();

  return result ?? null;
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
     SET stage = ?, progress = ?, slot = COALESCE(?, slot), updated_at = ?
     WHERE id = ? AND status = 'running'
     RETURNING ${JOB_COLUMNS}`,
  )
    .bind(patch.stage, patch.progress, patch.slot ?? null, now, id)
    .first<JobRow>();
  return result ?? null;
}

export async function listQueuedJobs(env: Env, limit = 20): Promise<JobRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT ${JOB_COLUMNS} FROM jobs
     WHERE status = 'queued' AND expires_at > ?
     ORDER BY created_at ASC LIMIT ?`,
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

/** Running jobs (including past expires_at — still need supervisor recovery). */
export async function countRunningJobs(env: Env): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) as c FROM jobs WHERE status = 'running'`,
  ).first<{ c: number }>();
  return row?.c ?? 0;
}

/**
 * Queued (non-expired) + any running — used for idle-stop and watchdog keep-alive.
 * Running rows past expires_at still count so we never SIGTERM mid-recovery.
 */
export async function countActiveJobs(env: Env): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) as c FROM jobs
     WHERE status = 'running'
        OR (status = 'queued' AND expires_at > ?)`,
  )
    .bind(Date.now())
    .first<{ c: number }>();
  return row?.c ?? 0;
}

export async function listRunningJobs(env: Env): Promise<JobRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT ${JOB_COLUMNS} FROM jobs WHERE status = 'running' ORDER BY updated_at ASC`,
  ).all<JobRow>();
  return results ?? [];
}

/**
 * Atomically claim the oldest queued job for a warm slot.
 * Extends expires_at from claim time (TTL clock starts at execution).
 * Retries with backoff on lost races. Returns null only when the queue is empty;
 * throws `claim_contention` if still racing after the deadline.
 */
export async function claimNextQueuedJob(env: Env, slot: number): Promise<JobRow | null> {
  const deadline = Date.now() + CLAIM_DEADLINE_MS;

  for (let attempt = 0; attempt < CLAIM_MAX_ATTEMPTS && Date.now() < deadline; attempt += 1) {
    const now = Date.now();
    const expiresAt = now + JOB_TTL_MS;

    const claimed = await env.DB.prepare(
      `UPDATE jobs
       SET status = 'running', stage = 'preparing', progress = 0.02, slot = ?,
           error = NULL, updated_at = ?, expires_at = ?
       WHERE id = (
         SELECT id FROM (
           SELECT id FROM jobs
           WHERE status = 'queued' AND expires_at > ?
           ORDER BY created_at ASC
           LIMIT 1
         )
       )
       AND status = 'queued'
       RETURNING ${JOB_COLUMNS}`,
    )
      .bind(slot, now, expiresAt, now)
      .first<JobRow>();

    if (claimed) return claimed;

    const remaining = await countQueuedJobs(env);
    if (remaining === 0) return null;

    const delay = Math.min(80, 2 ** Math.min(attempt, 6)) + Math.floor(Math.random() * 20);
    await sleep(delay);
  }

  const remaining = await countQueuedJobs(env);
  if (remaining === 0) return null;
  throw new Error('claim_contention');
}

export async function listActiveSlots(env: Env): Promise<number[]> {
  // Include expired running rows so slots stay reserved until stale recovery reaps them.
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT slot FROM jobs WHERE status = 'running' AND slot IS NOT NULL`,
  ).all<{ slot: number }>();
  return (results ?? []).map((r) => r.slot);
}

/**
 * Stuck running jobs: no heartbeat for olderThanMs, OR past expires_at (reap).
 */
export async function listStaleRunningJobs(
  env: Env,
  olderThanMs = STALE_JOB_MS,
): Promise<JobRow[]> {
  const now = Date.now();
  const cutoff = now - olderThanMs;
  const { results } = await env.DB.prepare(
    `SELECT ${JOB_COLUMNS} FROM jobs
     WHERE status = 'running' AND (updated_at < ? OR expires_at <= ?)
     ORDER BY updated_at ASC`,
  )
    .bind(cutoff, now)
    .all<JobRow>();
  return results ?? [];
}

export function jobAttempts(job: JobRow): number {
  return typeof job.attempts === 'number' && Number.isFinite(job.attempts) ? job.attempts : 0;
}

/** Mid-run artifact / stage patch — only while `running`. */
export async function updateJobRunning(
  env: Env,
  id: string,
  patch: {
    stage?: string;
    progress?: number;
    error?: string | null;
    clipId?: string | null;
    slot?: number | null;
    r2Key?: string | null;
  },
): Promise<JobRow | null> {
  return updateJobStage(env, id, { ...patch, status: 'running' });
}

/** Terminal `running` → `done` | `error`. */
export async function updateJobTerminal(
  env: Env,
  id: string,
  patch: {
    status: 'done' | 'error';
    stage: string;
    progress: number;
    error?: string | null;
    clipId?: string | null;
    slot?: number | null;
    r2Key?: string | null;
  },
): Promise<JobRow | null> {
  return updateJobStage(env, id, patch);
}

/**
 * Requeue a running job after a transient failure (increments attempts).
 * Becomes terminal error when max attempts is reached.
 */
export async function requeueOrFailJob(
  env: Env,
  id: string,
  error: string,
  maxAttempts = MAX_JOB_ATTEMPTS,
): Promise<{ job: JobRow; requeued: boolean } | null> {
  const job = await getJobById(env, id);
  if (!job || job.status !== 'running') return null;

  const nextAttempts = jobAttempts(job) + 1;
  const message = error.slice(0, ERROR_MESSAGE_MAX);
  const now = Date.now();

  if (nextAttempts >= maxAttempts) {
    const failed = await updateJobTerminal(env, id, {
      status: 'error',
      stage: 'error',
      progress: 1,
      error: message,
      slot: null,
    });
    return failed ? { job: failed, requeued: false } : null;
  }

  const result = await env.DB.prepare(
    `UPDATE jobs
     SET status = 'queued', stage = 'queued', progress = 0, error = ?, slot = NULL,
         attempts = ?, updated_at = ?, expires_at = ?
     WHERE id = ? AND status = 'running'
     RETURNING ${JOB_COLUMNS}`,
  )
    .bind(message, nextAttempts, now, now + JOB_TTL_MS, id)
    .first<JobRow>();

  return result ? { job: result, requeued: true } : null;
}

/** Mark every running job as error (admin reset). */
export async function failAllRunningJobs(
  env: Env,
  error = 'queue_reset',
): Promise<number> {
  const now = Date.now();
  const result = await env.DB.prepare(
    `UPDATE jobs
     SET status = 'error', stage = 'error', progress = 1, error = ?, slot = NULL, updated_at = ?
     WHERE status = 'running'`,
  )
    .bind(error.slice(0, ERROR_MESSAGE_MAX), now)
    .run();
  return result.meta.changes ?? 0;
}
