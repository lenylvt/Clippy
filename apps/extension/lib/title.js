/**
 * Keep in sync with @clippy/shared/title.
 * @param {string} title
 */
function cleanYoutubeTitle(title) {
  const cleaned = String(title ?? '')
    .replace(/\s*[-–—｜|]\s*YouTube\s*$/i, '')
    .replace(/^\(\d+\)\s*/, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  const max = globalThis.MAX_TITLE_LENGTH ?? 200;
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max).trimEnd();
}

/**
 * @param {string} title
 * @param {string} [fallback]
 */
function cleanTitle(title, fallback = 'Sans titre') {
  const cleaned = cleanYoutubeTitle(title);
  return cleaned || fallback;
}

globalThis.cleanYoutubeTitle = cleanYoutubeTitle;
globalThis.cleanTitle = cleanTitle;
