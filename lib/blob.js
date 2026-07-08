/** @param {Blob} blob */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'));
    reader.readAsDataURL(blob);
  });
}

/** @param {string} mimeType */
function normalizeDataMime(mimeType) {
  return mimeType.split(';')[0]?.trim() || 'video/webm';
}

/** @param {ArrayBuffer} buffer @param {string} mimeType */
function arrayBufferToDataUrl(buffer, mimeType) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  const safeMime = normalizeDataMime(mimeType);

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return `data:${safeMime};base64,${btoa(binary)}`;
}

globalThis.blobToDataUrl = blobToDataUrl;
globalThis.arrayBufferToDataUrl = arrayBufferToDataUrl;
globalThis.normalizeDataMime = normalizeDataMime;
