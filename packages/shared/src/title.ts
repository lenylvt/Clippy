const DEFAULT_FALLBACK = 'Sans titre';

/**
 * Strip common YouTube tab chrome from a title.
 * Returns empty string when nothing meaningful remains.
 */
export function cleanYoutubeTitle(title: string): string {
  return String(title ?? '')
    .replace(/\s*[-–—｜|]\s*YouTube\s*$/i, '')
    .replace(/^\(\d+\)\s*/, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .trim();
}

/**
 * Cleaned title for UI. Never returns the raw dirty string —
 * falls back to `fallback` (default « Sans titre ») when cleaning empties.
 */
export function cleanTitle(title: string, fallback: string = DEFAULT_FALLBACK): string {
  const cleaned = cleanYoutubeTitle(title);
  return cleaned || fallback;
}
