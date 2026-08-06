import { createId } from '../http/ids';
import type { Env } from '../types';

export async function upsertPushToken(
  env: Env,
  userId: string,
  token: string,
  platform = 'ios',
): Promise<void> {
  const now = Date.now();
  const existing = await env.DB.prepare(
    `SELECT id FROM push_tokens WHERE user_id = ? AND token = ?`,
  )
    .bind(userId, token)
    .first<{ id: string }>();

  if (existing) {
    await env.DB.prepare(`UPDATE push_tokens SET updated_at = ?, platform = ? WHERE id = ?`)
      .bind(now, platform, existing.id)
      .run();
    return;
  }

  await env.DB.prepare(
    `INSERT INTO push_tokens (id, user_id, token, platform, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(createId(), userId, token, platform, now, now)
    .run();
}

export async function listPushTokens(env: Env, userId: string): Promise<string[]> {
  const { results } = await env.DB.prepare(`SELECT token FROM push_tokens WHERE user_id = ?`)
    .bind(userId)
    .all<{ token: string }>();
  return (results ?? []).map((r) => r.token);
}
