/**
 * Client de création de clip (content → background).
 * Valide les bornes, normalise l’URL et le titre, capture une miniature.
 */

const THUMB_JPEG_QUALITY = 0.72;
const THUMB_WIDTH = 160;

/**
 * URL watch canonique (sans playlist / t= / tracking).
 * @param {string} videoId
 * @returns {string}
 */
function canonicalYoutubeWatchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

/**
 * Inclusive : durée dans [MIN_CLIP_SECONDS, MAX_CLIP_SECONDS].
 * @param {{ start: number; end: number }} clip
 */
function assertValidClipRange(clip) {
  const start = clip?.start;
  const end = clip?.end;
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new Error('invalid_clip_range');
  }
  if (end <= start) {
    throw new Error('invalid_clip_range');
  }
  const clipDuration = end - start;
  const maxSec =
    typeof globalThis.MAX_CLIP_SECONDS === 'number' ? globalThis.MAX_CLIP_SECONDS : 300;
  const minSec =
    typeof globalThis.MIN_CLIP_SECONDS === 'number' ? globalThis.MIN_CLIP_SECONDS : 3;
  // Bornes inclusives — aligné serveur / shared validateJob
  if (clipDuration > maxSec) {
    throw new Error('clip_too_long');
  }
  if (clipDuration < minSec) {
    throw new Error('clip_too_short');
  }
}

/**
 * Demande au background de créer un job clip serveur.
 * @param {{ start: number; end: number }} clip
 * @param {{
 *   jobId?: string;
 *   videoId?: string;
 *   youtubeUrl?: string;
 *   videoTitle?: string;
 * }} [options]
 */
async function startClipJob(clip, options = {}) {
  assertValidClipRange(clip);

  const youtubeUrl =
    options.youtubeUrl ||
    (options.videoId ? canonicalYoutubeWatchUrl(options.videoId) : '') ||
    (() => {
      const id = getYoutubeVideoId(window.location.href);
      return id ? canonicalYoutubeWatchUrl(id) : window.location.href;
    })();

  const videoId = options.videoId || getYoutubeVideoId(youtubeUrl);
  if (!videoId) {
    throw new Error('missing_video_id');
  }

  const title =
    options.videoTitle ||
    (typeof globalThis.cleanYoutubeTitle === 'function'
      ? globalThis.cleanYoutubeTitle(document.title)
      : String(document.title || '').trim()) ||
    'clip';

  const jobId = options.jobId;
  const clipDuration = clip.end - clip.start;

  clippyLog('clip', 'start', { clip, videoId, jobId, clipDuration });

  let result;
  try {
    result = await chrome.runtime.sendMessage({
      type: 'CREATE_CLIP',
      jobId,
      videoId,
      youtubeUrl: canonicalYoutubeWatchUrl(videoId),
      start: clip.start,
      end: clip.end,
      videoTitle: title,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err || '');
    if (/extension context invalidated/i.test(msg)) {
      throw new Error('extension_context_invalidated');
    }
    throw new Error(msg || 'sw_unreachable');
  }

  if (chrome.runtime.lastError) {
    throw new Error(chrome.runtime.lastError.message || 'sw_unreachable');
  }

  if (result == null) {
    throw new Error('sw_no_response');
  }

  if (!result?.ok) {
    throw new Error(result?.error ?? 'create_clip_failed');
  }

  clippyLog('clip', 'done', { id: result.id, url: result.url, jobId, accepted: !result.url });
  return result;
}

/**
 * Miniature : préfère l’URL YouTube ; canvas en fallback (souvent tainted).
 * @param {HTMLVideoElement | null} video
 * @param {string} [fallbackUrl]
 * @returns {string | undefined}
 */
function captureVideoThumb(video, fallbackUrl) {
  if (fallbackUrl) return fallbackUrl;

  if (video && video.readyState >= 2 && video.videoWidth > 0) {
    try {
      const w = THUMB_WIDTH;
      const h = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * w));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0, w, h);
        return canvas.toDataURL('image/jpeg', THUMB_JPEG_QUALITY);
      }
    } catch {
      /* canvas often tainted on YouTube — fall through */
    }
  }
  return undefined;
}

globalThis.canonicalYoutubeWatchUrl = canonicalYoutubeWatchUrl;
globalThis.assertValidClipRange = assertValidClipRange;
globalThis.startClipJob = startClipJob;
globalThis.captureVideoThumb = captureVideoThumb;
