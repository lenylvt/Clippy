/**
 * Keep in sync with @clippy/shared/time.
 * @param {number} seconds
 */
function formatDuration(seconds) {
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

/**
 * Duration with tenths — for scrub / frame preview.
 * @param {number} seconds
 */
function formatScrubDuration(seconds) {
  if (!Number.isFinite(seconds)) return '0:00.0';
  const t = Math.max(0, seconds);
  const whole = Math.floor(t);
  const tenths = Math.floor((t - whole) * 10);
  return `${formatDuration(whole)}.${tenths}`;
}

/** @param {string | number} value */
function parseDuration(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;

  const parts = trimmed.split(':').map((p) => p.trim());
  if (parts.length < 1 || parts.length > 3) return null;
  if (parts.some((p) => !/^\d+$/.test(p))) return null;

  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return null;

  const MAX_HOURS = 24;

  if (parts.length === 1) {
    const sec = nums[0];
    return sec > 0 ? sec : null;
  }

  if (parts.length === 2) {
    const [m, s] = nums;
    if (m < 0 || s < 0 || s >= 60) return null;
    const total = m * 60 + s;
    return total > 0 ? total : null;
  }

  const [h, m, s] = nums;
  if (h < 0 || h > MAX_HOURS || m < 0 || s < 0 || m >= 60 || s >= 60) return null;
  const total = h * 3600 + m * 60 + s;
  return total > 0 ? total : null;
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (Number.isNaN(value)) return lo;
  if (value === Infinity) return hi;
  if (value === -Infinity) return lo;
  return Math.min(hi, Math.max(lo, value));
}

/**
 * @param {number} start
 * @param {number} end
 * @param {number} duration
 * @param {number} [minLength]
 * @param {number} [maxLength]
 */
function normalizeClip(
  start,
  end,
  duration,
  minLength = globalThis.MIN_CLIP_SECONDS,
  maxLength = globalThis.MAX_CLIP_SECONDS,
) {
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

  const maxLen = Math.min(Math.max(0, Number.isFinite(maxLength) ? maxLength : duration), duration);
  const minLen = Math.min(Math.max(0, Number.isFinite(minLength) ? minLength : 0), maxLen || duration);
  const len = clamp(b - a, minLen, maxLen || minLen);
  let s = clamp(a, 0, Math.max(0, duration - len));
  let e = s + len;
  if (e > duration) {
    e = duration;
    s = Math.max(0, e - len);
  }
  return { start: s, end: e };
}

/**
 * Effective min clip length for a video (never exceeds duration).
 * @param {number} duration
 */
function editorMinClipLength(duration) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(globalThis.MIN_CLIP_SECONDS, duration);
}

/**
 * Effective max clip length for a video.
 * @param {number} duration
 */
function editorMaxClipLength(duration) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(globalThis.MAX_CLIP_SECONDS, duration);
}

/** @param {number} time @param {number} start @param {number} end */
function isTimeInClip(time, start, end) {
  if (!Number.isFinite(time) || !Number.isFinite(start) || !Number.isFinite(end)) return false;
  return time >= start && time <= end;
}

globalThis.formatDuration = formatDuration;
globalThis.formatScrubDuration = formatScrubDuration;
globalThis.parseDuration = parseDuration;
globalThis.clamp = clamp;
globalThis.normalizeClip = normalizeClip;
globalThis.editorMinClipLength = editorMinClipLength;
globalThis.editorMaxClipLength = editorMaxClipLength;
globalThis.isTimeInClip = isTimeInClip;
