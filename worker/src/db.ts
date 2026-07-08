import type { Clip, ClipRow, Env } from './types';

const TTL_MS = 48 * 60 * 60 * 1000;

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
  };
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
  const expiresAt = now + TTL_MS;

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

  for (const row of results ?? []) {
    await env.CLIPS.delete(row.r2_key);
    await env.DB.prepare(`DELETE FROM clips WHERE id = ?`).bind(row.id).run();
  }

  return (results ?? []).length;
}
