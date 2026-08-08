import type { ClipRow, DeviceRow, Env, JobRow, UserRow } from '../types';

const JOB_COLUMNS = `id, status, stage, progress, video_id, video_title, youtube_url,
  clip_start, clip_end, clip_id, error, device_token, user_id, slot, r2_key,
  attempts, origin, created_at, updated_at, expires_at`;

const CLIP_COLUMNS = `id, video_id, video_title, youtube_url, r2_key,
  clip_start, clip_end, created_at, expires_at, user_id, video_duration`;

export async function adminCounts(env: Env) {
  const now = Date.now();
  const [users, jobs, clips, devices, activeJobs] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS n FROM users`).first<{ n: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM jobs`).first<{ n: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM clips WHERE expires_at > ?`)
      .bind(now)
      .first<{ n: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM devices WHERE user_id IS NOT NULL AND paired_at IS NOT NULL`,
    ).first<{ n: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM jobs WHERE status IN ('queued','running') AND expires_at > ?`,
    )
      .bind(now)
      .first<{ n: number }>(),
  ]);
  return {
    users: users?.n ?? 0,
    jobs: jobs?.n ?? 0,
    clips: clips?.n ?? 0,
    devices: devices?.n ?? 0,
    activeJobs: activeJobs?.n ?? 0,
  };
}

export async function listAdminUsers(env: Env, limit = 100, offset = 0) {
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.email, u.created_at,
       (SELECT COUNT(*) FROM jobs j WHERE j.user_id = u.id) AS jobs_count,
       (SELECT COUNT(*) FROM clips c WHERE c.user_id = u.id AND c.expires_at > ?) AS clips_count,
       (SELECT COUNT(*) FROM devices d WHERE d.user_id = u.id AND d.paired_at IS NOT NULL) AS devices_count
     FROM users u
     ORDER BY u.created_at DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(Date.now(), limit, offset)
    .all<UserRow & { jobs_count: number; clips_count: number; devices_count: number }>();
  return results ?? [];
}

export async function updateUserEmail(
  env: Env,
  id: string,
  email: string,
): Promise<UserRow | null> {
  await env.DB.prepare(`UPDATE users SET email = ? WHERE id = ?`).bind(email, id).run();
  return env.DB.prepare(`SELECT id, email, created_at FROM users WHERE id = ?`)
    .bind(id)
    .first<UserRow>();
}

export async function deleteUserCascade(env: Env, userId: string): Promise<boolean> {
  const user = await env.DB.prepare(`SELECT id FROM users WHERE id = ?`)
    .bind(userId)
    .first<{ id: string }>();
  if (!user) return false;

  const clips = await env.DB.prepare(`SELECT id, r2_key FROM clips WHERE user_id = ?`)
    .bind(userId)
    .all<{ id: string; r2_key: string }>();
  for (const clip of clips.results ?? []) {
    try {
      await env.CLIPS.delete(clip.r2_key);
    } catch {
      /* best effort */
    }
  }

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM clips WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM jobs WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM push_tokens WHERE user_id = ?`).bind(userId),
    env.DB.prepare(
      `UPDATE devices SET user_id = NULL, paired_at = NULL, label = NULL WHERE user_id = ?`,
    ).bind(userId),
    env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(userId),
  ]);
  return true;
}

export async function listAdminJobs(
  env: Env,
  opts: { status?: string; limit?: number; offset?: number },
) {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  if (opts.status) {
    const { results } = await env.DB.prepare(
      `SELECT ${JOB_COLUMNS} FROM jobs WHERE status = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
    )
      .bind(opts.status, limit, offset)
      .all<JobRow>();
    return results ?? [];
  }
  const { results } = await env.DB.prepare(
    `SELECT ${JOB_COLUMNS} FROM jobs ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(limit, offset)
    .all<JobRow>();
  return results ?? [];
}

export async function deleteTerminalJob(env: Env, id: string): Promise<boolean> {
  const result = await env.DB.prepare(
    `DELETE FROM jobs WHERE id = ? AND status IN ('done', 'error')`,
  )
    .bind(id)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function patchJobMeta(
  env: Env,
  id: string,
  patch: { videoTitle?: string; expiresAt?: number },
): Promise<JobRow | null> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (patch.videoTitle !== undefined) {
    sets.push('video_title = ?');
    binds.push(patch.videoTitle);
  }
  if (patch.expiresAt !== undefined) {
    sets.push('expires_at = ?');
    binds.push(patch.expiresAt);
  }
  if (sets.length === 0) return null;
  sets.push('updated_at = ?');
  binds.push(Date.now());
  binds.push(id);
  await env.DB.prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();
  return env.DB.prepare(`SELECT ${JOB_COLUMNS} FROM jobs WHERE id = ?`)
    .bind(id)
    .first<JobRow>();
}

export async function listAdminClips(env: Env, limit = 50, offset = 0) {
  const { results } = await env.DB.prepare(
    `SELECT ${CLIP_COLUMNS} FROM clips ORDER BY created_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(limit, offset)
    .all<ClipRow>();
  return results ?? [];
}

export async function deleteClipAdmin(env: Env, id: string): Promise<boolean> {
  const row = await env.DB.prepare(`DELETE FROM clips WHERE id = ? RETURNING r2_key`)
    .bind(id)
    .first<{ r2_key: string }>();
  if (!row) return false;
  try {
    await env.CLIPS.delete(row.r2_key);
  } catch {
    /* best effort */
  }
  return true;
}

export async function patchClipMeta(
  env: Env,
  id: string,
  patch: { videoTitle?: string; expiresAt?: number },
): Promise<ClipRow | null> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (patch.videoTitle !== undefined) {
    sets.push('video_title = ?');
    binds.push(patch.videoTitle);
  }
  if (patch.expiresAt !== undefined) {
    sets.push('expires_at = ?');
    binds.push(patch.expiresAt);
  }
  if (sets.length === 0) return null;
  binds.push(id);
  await env.DB.prepare(`UPDATE clips SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();
  return env.DB.prepare(`SELECT ${CLIP_COLUMNS} FROM clips WHERE id = ?`)
    .bind(id)
    .first<ClipRow>();
}

export async function listAdminDevices(env: Env, limit = 100, offset = 0) {
  const { results } = await env.DB.prepare(
    `SELECT device_token, device_id, user_id, label, paired_at, created_at
     FROM devices
     WHERE user_id IS NOT NULL AND paired_at IS NOT NULL
     ORDER BY paired_at DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(limit, offset)
    .all<DeviceRow>();
  return results ?? [];
}

export async function listUserSessions(env: Env, userId: string) {
  const { results } = await env.DB.prepare(
    `SELECT id, expires_at, created_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC`,
  )
    .bind(userId)
    .all<{ id: string; expires_at: number; created_at: number }>();
  return results ?? [];
}

export async function deleteSessionById(env: Env, userId: string, sessionId: string) {
  const result = await env.DB.prepare(`DELETE FROM sessions WHERE id = ? AND user_id = ?`)
    .bind(sessionId, userId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function deleteAllUserSessions(env: Env, userId: string) {
  const result = await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`)
    .bind(userId)
    .run();
  return result.meta?.changes ?? 0;
}

export async function deleteUserPushTokens(env: Env, userId: string) {
  const result = await env.DB.prepare(`DELETE FROM push_tokens WHERE user_id = ?`)
    .bind(userId)
    .run();
  return result.meta?.changes ?? 0;
}

/** Ensure a paired admin-labeled device for creating jobs without Chrome. */
export async function ensureAdminDeviceForUser(
  env: Env,
  userId: string,
): Promise<string> {
  const existing = await env.DB.prepare(
    `SELECT device_token FROM devices
     WHERE user_id = ? AND label = 'admin' AND paired_at IS NOT NULL
     LIMIT 1`,
  )
    .bind(userId)
    .first<{ device_token: string }>();
  if (existing) return existing.device_token;

  const { randomToken } = await import('../auth/crypto');
  const { createId } = await import('../http/ids');
  const token = randomToken(32);
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO devices (device_token, device_id, user_id, label, paired_at, created_at)
     VALUES (?, ?, ?, 'admin', ?, ?)`,
  )
    .bind(token, createId(), userId, now, now)
    .run();
  return token;
}
