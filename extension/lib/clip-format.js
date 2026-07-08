function clipExtensionFromMime(mimeType) {
  return String(mimeType).toLowerCase().includes('mp4') ? 'mp4' : 'webm';
}

globalThis.clipExtensionFromMime = clipExtensionFromMime;
