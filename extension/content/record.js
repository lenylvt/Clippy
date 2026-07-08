/** @typedef {{ start: number; end: number }} ClipRange */

/**
 * Create a clip via background download cache + ffmpeg crop.
 * @param {ClipRange} clip
 * @param {{ jobId?: string }} [options]
 */
async function startClipRecording(clip, options = {}) {
  const clipDuration = clip.end - clip.start;
  if (clipDuration > MAX_CLIP_SECONDS) {
    throw new Error('clip_too_long');
  }
  if (clipDuration < MIN_CLIP_SECONDS) {
    throw new Error('clip_too_short');
  }

  const youtubeUrl = window.location.href;
  const videoId = getYoutubeVideoId(youtubeUrl);
  if (!videoId) {
    throw new Error('missing_video_id');
  }

  const title = document.title.replace(/\s*-\s*YouTube\s*$/i, '').trim();
  const jobId = options.jobId;

  clippyLog('record', 'start', { clip, videoId, jobId });

  const result = await chrome.runtime.sendMessage({
    type: 'CREATE_CLIP',
    jobId,
    videoId,
    youtubeUrl,
    start: clip.start,
    end: clip.end,
    videoTitle: title,
  });

  if (!result?.ok) {
    throw new Error(result?.error ?? 'create_clip_failed');
  }

  clippyLog('record', 'done', { id: result.id, galleryUrl: result.galleryUrl, jobId });
  return result;
}

/**
 * Capture a small JPEG data-URL of the current video frame for queue thumbs.
 * @param {HTMLVideoElement | null} video
 * @returns {string | undefined}
 */
function captureVideoThumb(video) {
  if (!video || video.readyState < 2) return undefined;
  try {
    const w = 160;
    const h = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * w)) || 90;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(video, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return undefined;
  }
}

/**
 * Prefetch / ensure the source video is cached while the user trims.
 * @param {string} [youtubeUrl]
 */
async function ensureSourceCached(youtubeUrl = window.location.href) {
  const videoId = getYoutubeVideoId(youtubeUrl);
  if (!videoId) return { ok: false, error: 'missing_video_id' };

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'ENSURE_VIDEO_CACHE',
      videoId,
      youtubeUrl,
    });
    clippyLog('record', 'prefetch', result);
    return result ?? { ok: false, error: 'no_response' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    clippyLog('record', 'prefetch:fail', { error: message });
    return { ok: false, error: message };
  }
}

/**
 * @param {string} [youtubeUrl]
 */
function notifyVideoActive(youtubeUrl = window.location.href) {
  const videoId = getYoutubeVideoId(youtubeUrl);
  if (!videoId) return;
  chrome.runtime.sendMessage({ type: 'VIDEO_ACTIVE', videoId, youtubeUrl }).catch(() => {});
}

/**
 * @param {string} [youtubeUrl]
 */
function notifyVideoLeft(youtubeUrl = window.location.href) {
  const videoId = getYoutubeVideoId(youtubeUrl);
  chrome.runtime
    .sendMessage({ type: 'VIDEO_LEFT', videoId: videoId || undefined })
    .catch(() => {});
}

globalThis.startClipRecording = startClipRecording;
globalThis.captureVideoThumb = captureVideoThumb;
globalThis.ensureSourceCached = ensureSourceCached;
globalThis.notifyVideoActive = notifyVideoActive;
globalThis.notifyVideoLeft = notifyVideoLeft;
