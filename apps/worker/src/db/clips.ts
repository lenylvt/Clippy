import { CLIP_TTL_MS, DELETE_BATCH_SIZE } from '../constants';
import type { ClipRow, Env } from '../types';
import { normalizePositiveDuration } from './mappers';

const CLIP_COLUMNS = `id, video_id, video_title, youtube_url, r2_key,
  clip_start, clip_end, created_at, expires_at, user_id, video_duration`;

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
  const expiresAt = now + CLIP_TTL_MS;
  const videoDuration = normalizePositiveDuration(input.videoDuration ?? null);

  const inserted = await env.DB.prepare(
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

  if ((inserted.meta.changes ?? 0) > 0 && videoDuration != null) {
    await env.DB.prepare(
      `UPDATE clips SET video_duration = ?
       WHERE video_id = ? AND (video_duration IS NULL OR video_duration <= 0)`,
    )
      .bind(videoDuration, input.videoId)
      .run();
  }

  return { createdAt: now, expiresAt, inserted: (inserted.meta.changes ?? 0) > 0 };
}

export async function getClipById(env: Env, id: string): Promise<ClipRow | null> {
  return env.DB.prepare(`SELECT ${CLIP_COLUMNS} FROM clips WHERE id = ? AND expires_at > ?`)
    .bind(id, Date.now())
    .first<ClipRow>();
}

/**
 * Owner-scoped delete. Ownership is enforced in WHERE (not only at the route).
 * Expired rows remain deletable by the owner.
 */
export async function deleteClipById(env: Env, id: string, userId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `DELETE FROM clips WHERE id = ? AND user_id = ? RETURNING r2_key`,
  )
    .bind(id, userId)
    .first<{ r2_key: string }>();
  if (!row) return false;
  try {
    await env.CLIPS.delete(row.r2_key);
  } catch (error) {
    console.error('R2 delete after clip row removal failed', id, error);
  }
  return true;
}

async function deleteClipRows(
  env: Env,
  rows: Array<{ id: string; r2_key: string }>,
): Promise<number> {
  let deleted = 0;
  for (let index = 0; index < rows.length; index += DELETE_BATCH_SIZE) {
    const batch = rows.slice(index, index + DELETE_BATCH_SIZE);
    await Promise.all(
      batch.map(async (row) => {
        try {
          await env.CLIPS.delete(row.r2_key);
          const result = await env.DB.prepare(`DELETE FROM clips WHERE id = ?`).bind(row.id).run();
          if ((result.meta.changes ?? 0) > 0) deleted += 1;
        } catch (error) {
          console.error('clip cleanup row failed', row.id, error);
        }
      }),
    );
  }
  return deleted;
}

/**
 * Purge anonymous clips that are already expired — never wipe fresh orphans still in TTL.
 * Bounded batches to stay within D1 response limits.
 */
export async function deleteOrphanClips(env: Env): Promise<number> {
  const now = Date.now();
  let total = 0;
  for (;;) {
    const { results } = await env.DB.prepare(
      `SELECT id, r2_key FROM clips
       WHERE user_id IS NULL AND expires_at <= ?
       ORDER BY expires_at ASC
       LIMIT ?`,
    )
      .bind(now, DELETE_BATCH_SIZE * 5)
      .all<{ id: string; r2_key: string }>();
    const rows = results ?? [];
    if (rows.length === 0) break;
    total += await deleteClipRows(env, rows);
    if (rows.length < DELETE_BATCH_SIZE * 5) break;
  }
  return total;
}

export async function deleteExpiredClips(env: Env): Promise<number> {
  const now = Date.now();
  let total = 0;
  for (;;) {
    const { results } = await env.DB.prepare(
      `SELECT id, r2_key FROM clips WHERE expires_at <= ? ORDER BY expires_at ASC LIMIT ?`,
    )
      .bind(now, DELETE_BATCH_SIZE * 5)
      .all<{ id: string; r2_key: string }>();
    const rows = results ?? [];
    if (rows.length === 0) break;
    total += await deleteClipRows(env, rows);
    if (rows.length < DELETE_BATCH_SIZE * 5) break;
  }
  return total;
}
