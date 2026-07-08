/** @typedef {{
 *   blob: Blob;
 *   filename: string;
 *   videoId: string;
 *   videoTitle: string;
 *   youtubeUrl: string;
 *   clipStart: number;
 *   clipEnd: number;
 * }} ClipUploadInput */

/**
 * @param {ClipUploadInput} input
 * @param {string} workerUrl
 */
async function uploadClip(input, workerUrl) {
  const base = workerUrl.replace(/\/+$/, '');
  if (!base) {
    throw new Error('missing_worker_url');
  }

  const form = new FormData();
  form.append('file', input.blob, input.filename);
  form.append('videoId', input.videoId);
  form.append('videoTitle', input.videoTitle);
  form.append('youtubeUrl', input.youtubeUrl);
  form.append('clipStart', String(input.clipStart));
  form.append('clipEnd', String(input.clipEnd));

  const response = await fetch(`${base}/api/clips`, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    throw new Error(`upload_failed_${response.status}`);
  }

  const data = await response.json();
  if (!data?.ok) {
    throw new Error(data?.error ?? 'upload_failed');
  }

  return data;
}

globalThis.uploadClip = uploadClip;
