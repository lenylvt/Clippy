/** Panel inset over the video — left, right, bottom (px). */
const CLIPPY_PANEL_INSET = 10;
/** Fixed frame count for stable filmstrip cache. */
const CLIPPY_FILMSTRIP_COUNT = 10;
const CLIPPY_FILMSTRIP_MIN = 10;
const CLIPPY_FILMSTRIP_MAX = 10;
/** Fallback only — layout measures real panel height. */
const CLIPPY_PANEL_HEIGHT = 96;
const CLIPPY_PREVIEW_HIDE_MS = 700;
const CLIPPY_SEEK_TIMEOUT_MS = 900;
/** JPEG quality for filmstrip cells (0–1). */
const CLIPPY_FILMSTRIP_QUALITY = 0.82;

/**
 * @param {number} [_widthPx]
 */
function filmstripCountForWidth(_widthPx) {
  return CLIPPY_FILMSTRIP_COUNT;
}

/**
 * Cache key = videoId only.
 * @param {string} videoId
 * @param {number} [_duration]
 * @param {number} [_count]
 */
function filmstripCacheKey(videoId, _duration, _count) {
  if (!videoId || videoId === 'unknown') return '';
  return videoId;
}

globalThis.CLIPPY_PANEL_INSET = CLIPPY_PANEL_INSET;
globalThis.CLIPPY_FILMSTRIP_COUNT = CLIPPY_FILMSTRIP_COUNT;
globalThis.CLIPPY_FILMSTRIP_MIN = CLIPPY_FILMSTRIP_MIN;
globalThis.CLIPPY_FILMSTRIP_MAX = CLIPPY_FILMSTRIP_MAX;
globalThis.CLIPPY_PANEL_HEIGHT = CLIPPY_PANEL_HEIGHT;
globalThis.CLIPPY_PREVIEW_HIDE_MS = CLIPPY_PREVIEW_HIDE_MS;
globalThis.CLIPPY_SEEK_TIMEOUT_MS = CLIPPY_SEEK_TIMEOUT_MS;
globalThis.CLIPPY_FILMSTRIP_QUALITY = CLIPPY_FILMSTRIP_QUALITY;
globalThis.filmstripCountForWidth = filmstripCountForWidth;
globalThis.filmstripCacheKey = filmstripCacheKey;
