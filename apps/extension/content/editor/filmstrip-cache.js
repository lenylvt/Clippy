/** @type {Map<string, string[]>} videoId → dataURL frames */
const filmstripCache = new Map();

function clearFilmstripCache() {
  filmstripCache.clear();
  clippyLog('editor', 'filmstrip:cleared');
}

function getFilmstripCache() {
  return filmstripCache;
}

globalThis.filmstripCache = filmstripCache;
globalThis.clearFilmstripCache = clearFilmstripCache;
globalThis.getFilmstripCache = getFilmstripCache;
