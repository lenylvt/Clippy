import { PAIRING_TTL_MS } from '../constants';
import { randomPairingCode } from '../auth/crypto';
import type { Env } from '../types';
import { ensureDevice } from './devices';

export async function createPairingCode(env: Env, deviceToken: string): Promise<{ code: string; expiresAt: number }> {
  await ensureDevice(env, deviceToken);
  await env.DB.prepare(`DELETE FROM pairing_codes WHERE device_token = ? OR expires_at < ?`)
    .bind(deviceToken, Date.now())
    .run();

  const code = randomPairingCode(8);
  const now = Date.now();
  const expiresAt = now + PAIRING_TTL_MS;
  await env.DB.prepare(
    `INSERT INTO pairing_codes (code, device_token, expires_at, used_at, created_at) VALUES (?, ?, ?, NULL, ?)`,
  )
    .bind(code, deviceToken, expiresAt, now)
    .run();
  return { code, expiresAt };
}

export async function claimPairingCode(
  env: Env,
  code: string,
  userId: string,
): Promise<{ ok: true; deviceToken: string } | { ok: false; error: string }> {
  const normalized = code.trim().toUpperCase();
  const row = await env.DB.prepare(
    `SELECT code, device_token, expires_at, used_at FROM pairing_codes WHERE code = ?`,
  )
    .bind(normalized)
    .first<{ code: string; device_token: string; expires_at: number; used_at: number | null }>();

  if (!row) return { ok: false, error: 'invalid_code' };
  if (row.used_at) return { ok: false, error: 'code_used' };
  if (row.expires_at < Date.now()) return { ok: false, error: 'code_expired' };

  const device = await ensureDevice(env, row.device_token);
  if (device.user_id && device.user_id !== userId) {
    return { ok: false, error: 'device_linked_elsewhere' };
  }

  const now = Date.now();
  await env.DB.prepare(`UPDATE pairing_codes SET used_at = ? WHERE code = ?`).bind(now, normalized).run();
  await env.DB.prepare(`UPDATE devices SET user_id = ?, paired_at = ? WHERE device_token = ?`)
    .bind(userId, now, row.device_token)
    .run();

  return { ok: true, deviceToken: row.device_token };
}
