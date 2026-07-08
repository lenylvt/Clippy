export function clipExtensionFromMime(mimeType: string) {
  return mimeType.toLowerCase().includes('mp4') ? 'mp4' : 'webm';
}
