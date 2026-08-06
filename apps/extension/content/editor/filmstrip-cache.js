const FILMSTRIP_CACHE_MAX = 12;

/** @type {Map<string, string[]>} composite key → dataURL frames (LRU via re-insert) */
const filmstripCache = new Map();

/**
 * @param {string} key
 * @param {string[]} frames
 */
function setFilmstripCacheEntry(key, frames) {
  if (filmstripCache.has(key)) filmstripCache.delete(key);
  filmstripCache.set(key, frames);
  while (filmstripCache.size > FILMSTRIP_CACHE_MAX) {
    const oldest = filmstripCache.keys().next().value;
    if (oldest === undefined) break;
    filmstripCache.delete(oldest);
  }
}

/**
 * @param {string} key
 * @returns {string[] | undefined}
 */
function getFilmstripCacheEntry(key) {
  const frames = filmstripCache.get(key);
  if (!frames) return undefined;
  // refresh LRU order
  filmstripCache.delete(key);
  filmstripCache.set(key, frames);
  return frames;
}

function clearFilmstripCache() {
  filmstripCache.clear();
  clippyLog('editor', 'filmstrip:cleared');
}

function getFilmstripCache() {
  return {
    get: getFilmstripCacheEntry,
    set: setFilmstripCacheEntry,
    clear: clearFilmstripCache,
    get size() {
      return filmstripCache.size;
    },
  };
}

globalThis.FILMSTRIP_CACHE_MAX = FILMSTRIP_CACHE_MAX;
globalThis.clearFilmstripCache = clearFilmstripCache;
globalThis.getFilmstripCache = getFilmstripCache;
