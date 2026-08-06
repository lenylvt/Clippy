import { SESSION_TTL_MS } from '../constants';
import { createId } from '../http/ids';
import { randomToken, sha256Hex } from '../auth/crypto';
import type { Env, UserRow } from '../types';

export async function createSession(env: Env, userId: string): Promise<string> {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO sessions (id, token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(createId(), tokenHash, userId, now + SESSION_TTL_MS, now)
    .run();
  return token;
}

export async function getSessionUser(env: Env, token: string): Promise<UserRow | null> {
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.created_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(tokenHash, now)
    .first<UserRow>();
  return row;
}

export async function deleteSession(env: Env, token: string): Promise<void> {
  const tokenHash = await sha256Hex(token);
  await env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(tokenHash).run();
}
