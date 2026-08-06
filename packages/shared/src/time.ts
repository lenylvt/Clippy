import { MIN_CLIP_SECONDS } from './clipLimits';

/** Format seconds as m:ss or h:mm:ss. */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Alias used by the extension. */
export const formatDuration = formatTime;

export function formatRange(start: number, end: number): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

export function clipDuration(start: number, end: number): number {
  return Math.max(0, end - start);
}

/** Remaining time until expiresAt (ms epoch), e.g. "47h" / "12 min". */
export function formatAutoRemaining(expiresAt: number, now = Date.now()): string | null {
  if (!expiresAt || !Number.isFinite(expiresAt)) return null;
  const ms = expiresAt - now;
  if (ms <= 0) return '0h';
  const totalMin = Math.ceil(ms / 60_000);
  if (totalMin < 60) return `${totalMin} min`;
  const hours = Math.ceil(ms / 3_600_000);
  return `${hours}h`;
}

export function deleteButtonLabel(expiresAt: number, now = Date.now()): string {
  const remaining = formatAutoRemaining(expiresAt, now);
  if (!remaining) return 'Supprimer';
  return `Supprimer (Auto: ${remaining})`;
}

/** Full-video span for timeline: prefer probed videoDuration. */
export function timelineSpan(
  clips: { clipEnd: number; videoDuration?: number | null }[],
  fallbackEnd = 1,
): number {
  const probed = Math.max(
    0,
    ...clips.map((c) => (c.videoDuration != null && c.videoDuration > 0 ? c.videoDuration : 0)),
  );
  if (probed > 0) return probed;
  return Math.max(fallbackEnd, ...clips.map((c) => c.clipEnd), 1);
}

export function parseDuration(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(':').map((p) => p.trim());
  if (parts.some((p) => p === '' || Number.isNaN(Number(p)))) return null;

  if (parts.length === 1) {
    const sec = Number(parts[0]);
    return sec > 0 ? sec : null;
  }

  if (parts.length === 2) {
    const [m, s] = parts.map(Number);
    if (m! < 0 || s! < 0 || s! >= 60) return null;
    const total = m! * 60 + s!;
    return total > 0 ? total : null;
  }

  if (parts.length === 3) {
    const [h, m, s] = parts.map(Number);
    if (h! < 0 || m! < 0 || s! < 0 || m! >= 60 || s! >= 60) return null;
    const total = h! * 3600 + m! * 60 + s!;
    return total > 0 ? total : null;
  }

  return null;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeClip(
  start: number,
  end: number,
  duration: number,
  minLength = MIN_CLIP_SECONDS,
): { start: number; end: number } {
  const len = clamp(end - start, minLength, duration);
  let s = clamp(start, 0, duration - len);
  let e = s + len;
  if (e > duration) {
    e = duration;
    s = e - len;
  }
  return { start: s, end: e };
}

export function isTimeInClip(time: number, start: number, end: number): boolean {
  return time >= start && time <= end;
}
