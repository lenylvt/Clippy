/** @param {number} seconds */
function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** @param {string} value */
function parseDuration(value) {
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
    if (m < 0 || s < 0 || s >= 60) return null;
    const total = m * 60 + s;
    return total > 0 ? total : null;
  }

  if (parts.length === 3) {
    const [h, m, s] = parts.map(Number);
    if (h < 0 || m < 0 || s < 0 || m >= 60 || s >= 60) return null;
    const total = h * 3600 + m * 60 + s;
    return total > 0 ? total : null;
  }

  return null;
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** @param {number} start @param {number} end @param {number} duration @param {number} minLength */
function normalizeClip(start, end, duration, minLength = 3) {
  const len = clamp(end - start, minLength, duration);
  let s = clamp(start, 0, duration - len);
  let e = s + len;
  if (e > duration) {
    e = duration;
    s = e - len;
  }
  return { start: s, end: e };
}

/** @param {number} time @param {number} start @param {number} end */
function isTimeInClip(time, start, end) {
  return time >= start && time <= end;
}

globalThis.formatDuration = formatDuration;
globalThis.parseDuration = parseDuration;
globalThis.clamp = clamp;
globalThis.normalizeClip = normalizeClip;
globalThis.isTimeInClip = isTimeInClip;
