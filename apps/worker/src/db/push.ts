import { createId } from '../http/ids';
import type { Env } from '../types';

function isTransientD1Error(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /SQLITE_BUSY|SQLITE_LOCKED|D1_ERROR|503|429/i.test(msg);
}

async function d1Retry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!isTransientD1Error(err) || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 20 * (i + 1)));
    }
  }
  throw last;
}

/** Upsert push token; UNIQUE(token) reassigns ownership to the latest user. */
export async function upsertPushToken(
  env: Env,
  userId: string,
  token: string,
  platform = 'ios',
): Promise<void> {
  const now = Date.now();
  await d1Retry(() =>
    env.DB.prepare(
      `INSERT INTO push_tokens (id, user_id, token, platform, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(token) DO UPDATE SET
         user_id = excluded.user_id,
         platform = excluded.platform,
         updated_at = excluded.updated_at`,
    )
      .bind(createId(), userId, token, platform, now, now)
      .run(),
  );
}

export async function listPushTokens(env: Env, userId: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    `SELECT token FROM push_tokens WHERE user_id = ? LIMIT 20`,
  )
    .bind(userId)
    .all<{ token: string }>();
  return (results ?? []).map((r) => r.token);
}

export async function deletePushToken(env: Env, token: string): Promise<boolean> {
  const result = await env.DB.prepare(`DELETE FROM push_tokens WHERE token = ?`).bind(token).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function deletePushTokensForUser(env: Env, userId: string): Promise<number> {
  const result = await env.DB.prepare(`DELETE FROM push_tokens WHERE user_id = ?`)
    .bind(userId)
    .run();
  return result.meta.changes ?? 0;
}
