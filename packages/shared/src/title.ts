export function cleanYoutubeTitle(title: string): string {
  return String(title || '')
    .replace(/\s*-\s*YouTube\s*$/i, '')
    .replace(/^\(\d+\)\s+/, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .trim();
}

/** Alias used by the mobile app. */
export function cleanTitle(title: string): string {
  return cleanYoutubeTitle(title) || title;
}
