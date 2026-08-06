import { DELETE_BATCH_SIZE, JOB_TTL_MS } from '../constants';
import type { Clip, ClipRow, Env } from '../types';
import { rowToClip } from './mappers';

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
    videoDuration?: number | null;
    userId?: string | null;
  },
) {
  const now = Date.now();
  const expiresAt = now + JOB_TTL_MS;
  const videoDuration =
    input.videoDuration != null && Number.isFinite(input.videoDuration) && input.videoDuration > 0
      ? input.videoDuration
      : null;

  await env.DB.prepare(
    `INSERT OR IGNORE INTO clips (
      id, video_id, video_title, youtube_url, r2_key,
      clip_start, clip_end, created_at, expires_at, user_id, video_duration
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      input.userId ?? null,
      videoDuration,
    )
    .run();

  if (videoDuration != null) {
    await env.DB.prepare(
      `UPDATE clips SET video_duration = ?
       WHERE video_id = ? AND (video_duration IS NULL OR video_duration <= 0)`,
    )
      .bind(videoDuration, input.videoId)
      .run();
  }

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

export async function deleteOrphanClips(env: Env): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT id, r2_key FROM clips WHERE user_id IS NULL`,
  ).all<{ id: string; r2_key: string }>();

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
