/**
 * Ask the background to create a server-side clip job.
 * @param {{ start: number; end: number }} clip
 * @param {{ jobId?: string }} [options]
 */
async function startClipJob(clip, options = {}) {
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

  clippyLog('clip', 'start', { clip, videoId, jobId });

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

  clippyLog('clip', 'done', { id: result.id, galleryUrl: result.galleryUrl, jobId });
  return result;
}

/**
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

globalThis.startClipJob = startClipJob;
globalThis.captureVideoThumb = captureVideoThumb;
