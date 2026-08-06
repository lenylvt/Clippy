/** @param {string} title */
function cleanYoutubeTitle(title) {
  return String(title || '')
    .replace(/\s*-\s*YouTube\s*$/i, '')
    .replace(/^\(\d+\)\s+/, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .trim();
}

globalThis.cleanYoutubeTitle = cleanYoutubeTitle;
