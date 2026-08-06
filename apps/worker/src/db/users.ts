import { OTP_MAX_ATTEMPTS, OTP_TTL_MS } from '../constants';
import { createId } from '../http/ids';
import { sha256Hex } from '../auth/crypto';
import type { Env, UserRow } from '../types';

export async function getUserByEmail(env: Env, email: string): Promise<UserRow | null> {
  return env.DB.prepare(`SELECT * FROM users WHERE email = ? COLLATE NOCASE`)
    .bind(email)
    .first<UserRow>();
}

export async function getUserById(env: Env, id: string): Promise<UserRow | null> {
  return env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(id).first<UserRow>();
}

export async function createUser(env: Env, email: string): Promise<UserRow> {
  const id = createId();
  const created_at = Date.now();
  await env.DB.prepare(`INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`)
    .bind(id, email, created_at)
    .run();
  return { id, email, created_at };
}

export async function upsertOtp(env: Env, email: string, codeHash: string): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO auth_otps (email, code_hash, expires_at, attempts, created_at)
     VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(email) DO UPDATE SET
       code_hash = excluded.code_hash,
       expires_at = excluded.expires_at,
       attempts = 0,
       created_at = excluded.created_at`,
  )
    .bind(email, codeHash, now + OTP_TTL_MS, now)
    .run();
}

export async function getOtp(
  env: Env,
  email: string,
): Promise<{ code_hash: string; expires_at: number; attempts: number } | null> {
  return env.DB.prepare(`SELECT code_hash, expires_at, attempts FROM auth_otps WHERE email = ? COLLATE NOCASE`)
    .bind(email)
    .first();
}

export async function bumpOtpAttempts(env: Env, email: string): Promise<number> {
  await env.DB.prepare(`UPDATE auth_otps SET attempts = attempts + 1 WHERE email = ? COLLATE NOCASE`)
    .bind(email)
    .run();
  const row = await getOtp(env, email);
  return row?.attempts ?? OTP_MAX_ATTEMPTS;
}

export async function deleteOtp(env: Env, email: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM auth_otps WHERE email = ? COLLATE NOCASE`).bind(email).run();
}
