import type { DeviceRow, Env } from '../types';

export async function ensureDevice(env: Env, deviceToken: string): Promise<DeviceRow> {
  const existing = await env.DB.prepare(`SELECT * FROM devices WHERE device_token = ?`)
    .bind(deviceToken)
    .first<DeviceRow>();
  if (existing) return existing;
  const created_at = Date.now();
  await env.DB.prepare(
    `INSERT INTO devices (device_token, user_id, label, paired_at, created_at) VALUES (?, NULL, NULL, NULL, ?)`,
  )
    .bind(deviceToken, created_at)
    .run();
  return {
    device_token: deviceToken,
    user_id: null,
    label: null,
    paired_at: null,
    created_at,
  };
}

export async function getDevice(env: Env, deviceToken: string): Promise<DeviceRow | null> {
  return env.DB.prepare(`SELECT * FROM devices WHERE device_token = ?`)
    .bind(deviceToken)
    .first<DeviceRow>();
}

export async function listPairedDevices(env: Env, userId: string) {
  const { results } = await env.DB.prepare(
    `SELECT device_token, label, paired_at, created_at FROM devices WHERE user_id = ? ORDER BY paired_at DESC`,
  )
    .bind(userId)
    .all<{ device_token: string; label: string | null; paired_at: number | null; created_at: number }>();

  return (results ?? []).map((row) => ({
    id: row.device_token.slice(0, 12),
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
      `UPDATE devices SET user_id = NULL, paired_at = NULL WHERE device_token = ? AND user_id = ?`,
    )
      .bind(opts.deviceToken, opts.userId)
      .run();
    return (result.meta.changes ?? 0) > 0;
  }
  const result = await env.DB.prepare(
    `UPDATE devices SET user_id = NULL, paired_at = NULL WHERE device_token = ?`,
  )
    .bind(opts.deviceToken)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function unlinkDeviceByPrefix(
  env: Env,
  userId: string,
  prefix: string,
): Promise<boolean> {
  const devices = await listPairedDevices(env, userId);
  const match = devices.find((d) => d.id === prefix || d.token === prefix);
  if (!match) return false;
  return unlinkDevice(env, { userId, deviceToken: match.token });
}
