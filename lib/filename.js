/** @param {string} title */
function sanitizeFilename(title) {
  const cleaned = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/['’`]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

  return cleaned || 'clip';
}

globalThis.sanitizeFilename = sanitizeFilename;
