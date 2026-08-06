import { createId } from '../http/ids';
import type { DeviceRow, Env } from '../types';

export async function ensureDevice(env: Env, deviceToken: string): Promise<DeviceRow> {
  const created_at = Date.now();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO devices (device_token, device_id, user_id, label, paired_at, created_at)
     VALUES (?, ?, NULL, NULL, NULL, ?)`,
  )
    .bind(deviceToken, createId(), created_at)
    .run();

  let row = await getDevice(env, deviceToken);
  if (!row) {
    // Extremely unlikely: INSERT ignored and SELECT miss — retry once
    row = await getDevice(env, deviceToken);
  }
  if (!row) {
    throw new Error('device_ensure_failed');
  }

  if (!row.device_id) {
    await env.DB.prepare(
      `UPDATE devices SET device_id = ? WHERE device_token = ? AND device_id IS NULL`,
    )
      .bind(createId(), deviceToken)
      .run();
    row = (await getDevice(env, deviceToken)) ?? row;
  }

  return row;
}

export async function getDevice(env: Env, deviceToken: string): Promise<DeviceRow | null> {
  return env.DB.prepare(`SELECT * FROM devices WHERE device_token = ?`)
    .bind(deviceToken)
    .first<DeviceRow>();
}

export async function listPairedDevices(env: Env, userId: string) {
  const { results } = await env.DB.prepare(
    `SELECT device_id, device_token, label, paired_at, created_at
     FROM devices
     WHERE user_id = ? AND paired_at IS NOT NULL
     ORDER BY paired_at DESC`,
  )
    .bind(userId)
    .all<{
      device_id: string | null;
      device_token: string;
      label: string | null;
      paired_at: number | null;
      created_at: number;
    }>();

  return (results ?? []).map((row) => ({
    id: row.device_id ?? row.device_token.slice(0, 12),
    token: row.device_token,
    label: row.label || 'Chrome',
    pairedAt: row.paired_at,
  }));
}

export async function unlinkDevice(
  env: Env,
  opts: { userId?: string; deviceToken: string },
): Promise<boolean> {
  if (opts.userId) {
    const result = await env.DB.prepare(
      `UPDATE devices SET user_id = NULL, paired_at = NULL, label = NULL
       WHERE device_token = ? AND user_id = ?`,
    )
      .bind(opts.deviceToken, opts.userId)
      .run();
    return (result.meta.changes ?? 0) > 0;
  }
  const result = await env.DB.prepare(
    `UPDATE devices SET user_id = NULL, paired_at = NULL, label = NULL WHERE device_token = ?`,
  )
    .bind(opts.deviceToken)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/** Unlink by stable `device_id` or exact `device_token` (never prefix collision). */
export async function unlinkDeviceByPrefix(
  env: Env,
  userId: string,
  idOrToken: string,
): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE devices SET user_id = NULL, paired_at = NULL, label = NULL
     WHERE user_id = ? AND (device_id = ? OR device_token = ?)`,
  )
    .bind(userId, idOrToken, idOrToken)
    .run();
  return (result.meta.changes ?? 0) > 0;
}
