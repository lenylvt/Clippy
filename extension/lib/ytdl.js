const YTDL_BASE = 'https://ytdl.openutils.net';
const YTDL_DEFAULT_FMT = 'mp4-1080';

/**
 * @param {string} youtubeUrl
 * @returns {string}
 */
function ytdlInfoUrl(youtubeUrl) {
  const url = new URL(`${YTDL_BASE}/api/info`);
  url.searchParams.set('url', youtubeUrl);
  return url.toString();
}

/**
 * @param {string} youtubeUrl
 * @param {string} [fmt]
 * @returns {string}
 */
function ytdlVideoStreamUrl(youtubeUrl, fmt = YTDL_DEFAULT_FMT) {
  const url = new URL(`${YTDL_BASE}/api/stream/video`);
  url.searchParams.set('url', youtubeUrl);
  url.searchParams.set('fmt', fmt);
  return url.toString();
}

/**
 * @param {string} youtubeUrl
 * @returns {Promise<{ title?: string; duration?: number; thumbnail?: string; filesize_mb?: number }>}
 */
async function fetchYtdlInfo(youtubeUrl) {
  const response = await fetch(ytdlInfoUrl(youtubeUrl));
  if (!response.ok) {
    throw new Error(`ytdl_info_${response.status}`);
  }
  return response.json();
}

/**
 * Download full MP4 for a YouTube URL via OpenUtils YTDL.
 * @param {string} youtubeUrl
 * @param {{ fmt?: string; signal?: AbortSignal }} [options]
 * @returns {Promise<Blob>}
 */
async function downloadYtdlVideo(youtubeUrl, options = {}) {
  const fmt = options.fmt ?? YTDL_DEFAULT_FMT;
  const response = await fetch(ytdlVideoStreamUrl(youtubeUrl, fmt), {
    signal: options.signal,
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`ytdl_stream_${response.status}`);
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html') || contentType.includes('application/json')) {
    throw new Error('ytdl_stream_invalid_body');
  }

  const blob = await response.blob();
  if (blob.size < 10_000) {
    throw new Error('ytdl_stream_empty');
  }

  const type = contentType.includes('mp4') || blob.type.includes('mp4') ? 'video/mp4' : blob.type || 'video/mp4';
  return blob.type === type ? blob : new Blob([blob], { type });
}

globalThis.YTDL_BASE = YTDL_BASE;
globalThis.YTDL_DEFAULT_FMT = YTDL_DEFAULT_FMT;
globalThis.ytdlInfoUrl = ytdlInfoUrl;
globalThis.ytdlVideoStreamUrl = ytdlVideoStreamUrl;
globalThis.fetchYtdlInfo = fetchYtdlInfo;
globalThis.downloadYtdlVideo = downloadYtdlVideo;
