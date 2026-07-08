/** @param {string} mimeType */
export function clipExtensionFromMime(mimeType) {
  return String(mimeType).toLowerCase().includes('mp4') ? 'mp4' : 'webm';
}
