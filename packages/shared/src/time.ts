import { MIN_CLIP_SECONDS } from './clipLimits';

/**
 * Format seconds as `m:ss` or `h:mm:ss`.
 * Non-finite values → `0:00`. Minutes under 1h are not zero-padded (`1:05`, not `01:05`).
 */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Alias used by the extension (same as {@link formatTime}). */
export const formatDuration = formatTime;

/** Inclusive visual range with an en dash (`–`). */
export function formatRange(start: number, end: number): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

export function clipDuration(start: number, end: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start);
}

/**
 * Remaining time until `expiresAt` (ms epoch).
 * Examples: `"47h"`, `"12 min"`, `"0 min"` when expired / non-positive.
 */
export function formatAutoRemaining(expiresAt: number, now = Date.now()): string | null {
  if (!expiresAt || !Number.isFinite(expiresAt)) return null;
  const ms = expiresAt - now;
  if (ms <= 0) return '0 min';
  const totalMin = Math.ceil(ms / 60_000);
  if (totalMin < 60) return `${totalMin} min`;
  const hours = Math.ceil(ms / 3_600_000);
  return `${hours}h`;
}

/** FR delete CTA with optional auto-delete countdown (hardcoded copy for mobile). */
export function deleteButtonLabel(expiresAt: number, now = Date.now()): string {
  const remaining = formatAutoRemaining(expiresAt, now);
  if (!remaining) return 'Supprimer';
  return `Supprimer (Auto: ${remaining})`;
}

/**
 * Full-video span for timeline: prefer probed `videoDuration`.
 * Empty clips → `fallbackEnd` (default 1). Non-finite durations are ignored.
 */
export function timelineSpan(
  clips: { clipEnd: number; videoDuration?: number | null }[],
  fallbackEnd = 1,
): number {
  if (clips.length === 0) return fallbackEnd;

  const probed = Math.max(
    0,
    ...clips.map((c) =>
      c.videoDuration != null && Number.isFinite(c.videoDuration) && c.videoDuration > 0
        ? c.videoDuration
        : 0,
    ),
  );
  if (probed > 0) return probed;

  const ends = clips
    .map((c) => c.clipEnd)
    .filter((n): n is number => Number.isFinite(n));
  if (ends.length === 0) return fallbackEnd;
  return Math.max(fallbackEnd, ...ends);
}

/** Parse `s`, `m:ss`, or `h:mm:ss` (integer parts only; rejects scientific / signed junk). */
export function parseDuration(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(':').map((p) => p.trim());
  if (parts.length < 1 || parts.length > 3) return null;
  if (parts.some((p) => !/^\d+$/.test(p))) return null;

  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return null;

  // Cap hours to a day to avoid absurd timelines.
  const MAX_HOURS = 24;

  if (parts.length === 1) {
    const sec = nums[0]!;
    return sec > 0 ? sec : null;
  }

  if (parts.length === 2) {
    const [m, s] = nums;
    if (m! < 0 || s! < 0 || s! >= 60) return null;
    const total = m! * 60 + s!;
    return total > 0 ? total : null;
  }

  const [h, m, s] = nums;
  if (h! < 0 || h! > MAX_HOURS || m! < 0 || s! < 0 || m! >= 60 || s! >= 60) return null;
  const total = h! * 3600 + m! * 60 + s!;
  return total > 0 ? total : null;
}

export function clamp(value: number, min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (Number.isNaN(value)) return lo;
  if (value === Infinity) return hi;
  if (value === -Infinity) return lo;
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Clamp a clip into `[0, duration]`.
 * Non-positive / non-finite `duration` → `{ start: 0, end: 0 }`.
 * Non-finite `end` → `{ start: 0, end: 0 }`; non-finite `start` → treated as `0`.
 * If `end < start`, bounds are swapped before clamping.
 */
export function normalizeClip(
  start: number,
  end: number,
  duration: number,
  minLength = MIN_CLIP_SECONDS,
  maxLength: number = Number.POSITIVE_INFINITY,
): { start: number; end: number } {
  if (!Number.isFinite(duration) || duration <= 0) {
    return { start: 0, end: 0 };
  }
  if (!Number.isFinite(end)) {
    return { start: 0, end: 0 };
  }

  let a = Number.isFinite(start) ? start : 0;
  let b = end;
  if (b < a) {
    const tmp = a;
    a = b;
    b = tmp;
  }

  const maxLen = Math.min(
    duration,
    Number.isFinite(maxLength) ? Math.max(0, maxLength) : duration,
  );
  const minLen = Math.min(Math.max(0, minLength), maxLen || duration);
  const len = clamp(b - a, minLen, maxLen || minLen);
  let s = clamp(a, 0, Math.max(0, duration - len));
  let e = s + len;
  if (e > duration) {
    e = duration;
    s = Math.max(0, e - len);
  }
  return { start: s, end: e };
}

/** Inclusive interval `[start, end]` (matches editor playhead UX). */
export function isTimeInClip(time: number, start: number, end: number): boolean {
  if (!Number.isFinite(time) || !Number.isFinite(start) || !Number.isFinite(end)) return false;
  return time >= start && time <= end;
}
