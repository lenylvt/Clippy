import { DELETE_BATCH_SIZE, JOB_TTL_MS } from './constants';
import type { Clip, ClipRow, Env, JobPublic, JobRow } from './types';

function extensionFromR2Key(r2Key: string): 'mp4' | 'webm' {
  return r2Key.endsWith('.mp4') ? 'mp4' : 'webm';
}

export function rowToClip(row: ClipRow, origin: string): Clip {
  return {
    id: row.id,
    videoId: row.video_id,
    videoTitle: row.video_title,
    youtubeUrl: row.youtube_url,
    clipStart: row.clip_start,
    clipEnd: row.clip_end,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    url: `${origin}/clips/${row.id}`,
    extension: extensionFromR2Key(row.r2_key),
  };
}

export function rowToJob(row: JobRow, origin: string): JobPublic {
  const job: JobPublic = {
    id: row.id,
    status: row.status,
    stage: row.stage,
    progress: row.progress,
    videoId: row.video_id,
    videoTitle: row.video_title,
    youtubeUrl: row.youtube_url,
    clipStart: row.clip_start,
    clipEnd: row.clip_end,
    clipId: row.clip_id,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.clip_id) {
    job.url = `${origin}/clips/${row.clip_id}`;
    job.galleryUrl = `${origin}/`;
  }
  return job;
}

export async function insertClip(
  env: Env,
  input: {
    id: string;
    videoId: string;
    videoTitle: string;
    youtubeUrl: string;
    r2Key: string;
    clipStart: number;
    clipEnd: number;
  },
) {
  const now = Date.now();
  const expiresAt = now + JOB_TTL_MS;

  await env.DB.prepare(
    `INSERT INTO clips (
      id, video_id, video_title, youtube_url, r2_key,
      clip_start, clip_end, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      input.id,
      input.videoId,
      input.videoTitle,
      input.youtubeUrl,
      input.r2Key,
      input.clipStart,
      input.clipEnd,
      now,
      expiresAt,
    )
    .run();

  return { createdAt: now, expiresAt };
}

export async function listClips(env: Env, origin: string): Promise<Clip[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM clips WHERE expires_at > ? ORDER BY created_at DESC`,
  )
    .bind(Date.now())
    .all<ClipRow>();

  return (results ?? []).map((row) => rowToClip(row, origin));
}

export async function getClipById(env: Env, id: string): Promise<ClipRow | null> {
  return env.DB.prepare(`SELECT * FROM clips WHERE id = ? AND expires_at > ?`)
    .bind(id, Date.now())
    .first<ClipRow>();
}

export async function deleteClipById(env: Env, id: string) {
  const clip = await getClipById(env, id);
  if (!clip) return false;

  await env.CLIPS.delete(clip.r2_key);
  await env.DB.prepare(`DELETE FROM clips WHERE id = ?`).bind(id).run();
  return true;
}

export async function deleteExpiredClips(env: Env) {
  const { results } = await env.DB.prepare(`SELECT id, r2_key FROM clips WHERE expires_at <= ?`)
    .bind(Date.now())
    .all<{ id: string; r2_key: string }>();

  const rows = results ?? [];

  for (let index = 0; index < rows.length; index += DELETE_BATCH_SIZE) {
    const batch = rows.slice(index, index + DELETE_BATCH_SIZE);
    await Promise.all(
      batch.map(async (row) => {
        await env.CLIPS.delete(row.r2_key);
        await env.DB.prepare(`DELETE FROM clips WHERE id = ?`).bind(row.id).run();
      }),
    );
  }

  return rows.length;
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
  },
) {
  const now = Date.now();
  const expiresAt = now + JOB_TTL_MS;
  await env.DB.prepare(
    `INSERT INTO jobs (
      id, status, stage, progress, video_id, video_title, youtube_url,
      clip_start, clip_end, clip_id, error, device_token, slot,
      created_at, updated_at, expires_at
    ) VALUES (?, 'queued', 'queued', 0, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, ?, ?, ?)`,
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
    )
    .run();
  return { createdAt: now, expiresAt };
}

export async function getJobById(env: Env, id: string): Promise<JobRow | null> {
  return env.DB.prepare(`SELECT * FROM jobs WHERE id = ?`).bind(id).first<JobRow>();
}

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
  const now = Date.now();

  await env.DB.prepare(
    `UPDATE jobs SET status = ?, stage = ?, progress = ?, error = ?, clip_id = ?, slot = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(status, stage, progress, error, clipId, slot, now, id)
    .run();

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

export async function listActiveSlots(env: Env): Promise<number[]> {
  const { results } = await env.DB.prepare(
    `SELECT slot FROM jobs WHERE status = 'running' AND slot IS NOT NULL AND expires_at > ?`,
  )
    .bind(Date.now())
    .all<{ slot: number }>();
  return (results ?? []).map((r) => r.slot);
}
