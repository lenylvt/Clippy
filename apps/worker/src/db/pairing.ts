import { PAIRING_TTL_MS } from '../constants';
import { randomPairingCode } from '../auth/crypto';
import type { Env } from '../types';
import { ensureDevice } from './devices';

function isConstraintError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /UNIQUE|constraint|SQLITE_CONSTRAINT/i.test(msg);
}

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

export async function createPairingCode(
  env: Env,
  deviceToken: string,
): Promise<{ code: string; expiresAt: number }> {
  await ensureDevice(env, deviceToken);
  const now = Date.now();
  const expiresAt = now + PAIRING_TTL_MS;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomPairingCode(8);
    try {
      await d1Retry(() =>
        env.DB.batch([
          env.DB.prepare(`DELETE FROM pairing_codes WHERE device_token = ? OR expires_at <= ?`).bind(
            deviceToken,
            now,
          ),
          env.DB.prepare(
            `INSERT INTO pairing_codes (code, device_token, expires_at, used_at, created_at)
             VALUES (?, ?, ?, NULL, ?)`,
          ).bind(code, deviceToken, expiresAt, now),
        ]),
      );
      return { code, expiresAt };
    } catch (err) {
      if (!isConstraintError(err) || attempt === 4) throw err;
    }
  }

  throw new Error('pairing_code_create_failed');
}

export async function claimPairingCode(
  env: Env,
  code: string,
  userId: string,
): Promise<{ ok: true; deviceToken: string } | { ok: false; error: string }> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return { ok: false, error: 'invalid_code' };

  const now = Date.now();
  const row = await env.DB.prepare(
    `SELECT code, device_token, expires_at, used_at FROM pairing_codes WHERE code = ?`,
  )
    .bind(normalized)
    .first<{ code: string; device_token: string; expires_at: number; used_at: number | null }>();

  if (!row) return { ok: false, error: 'invalid_code' };
  if (row.used_at != null) return { ok: false, error: 'code_used' };
  if (row.expires_at <= now) return { ok: false, error: 'code_expired' };

  const device = await ensureDevice(env, row.device_token);
  if (device.user_id && device.user_id !== userId) {
    return { ok: false, error: 'device_linked_elsewhere' };
  }

  const results = await d1Retry(() =>
    env.DB.batch([
      env.DB.prepare(
        `UPDATE pairing_codes SET used_at = ?
         WHERE code = ? AND used_at IS NULL AND expires_at > ?`,
      ).bind(now, normalized, now),
      env.DB.prepare(
        `UPDATE devices SET user_id = ?, paired_at = ?
         WHERE device_token = ? AND (user_id IS NULL OR user_id = ?)`,
      ).bind(userId, now, row.device_token, userId),
    ]),
  );

  const claimed = (results[0]?.meta.changes ?? 0) === 1;
  const linked = (results[1]?.meta.changes ?? 0) === 1;

  if (!claimed) {
    return { ok: false, error: 'code_used' };
  }

  if (!linked) {
    await env.DB.prepare(
      `UPDATE pairing_codes SET used_at = NULL WHERE code = ? AND used_at = ?`,
    )
      .bind(normalized, now)
      .run();
    return { ok: false, error: 'device_linked_elsewhere' };
  }

  return { ok: true, deviceToken: row.device_token };
}
