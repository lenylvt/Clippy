const YOUTUBE_VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

/** @param {string} hostname */
function isYoutubeHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === 'youtu.be' || host === 'www.youtu.be') return true;
  if (host === 'youtube.com' || host.endsWith('.youtube.com')) return true;
  if (host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com')) return true;
  return false;
}

/** @param {string} raw */
function normalizeYoutubeUrlInput(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

/**
 * Raw id from a YouTube URL (watch / shorts / embed / live / v / youtu.be).
 * Keep in sync with @clippy/shared/youtube.
 * @param {string} url
 */
function parseYoutubeVideoId(url) {
  try {
    let input = normalizeYoutubeUrlInput(url);
    const amp = input.indexOf('&');
    const q = input.indexOf('?');
    if (amp !== -1 && (q === -1 || amp < q)) {
      input = `${input.slice(0, amp)}?${input.slice(amp + 1)}`;
    }

    const parsed = new URL(input);
    if (!isYoutubeHost(parsed.hostname)) return '';

    const host = parsed.hostname.toLowerCase();
    if (host === 'youtu.be' || host === 'www.youtu.be') {
      return parsed.pathname.replace(/^\//, '').split('/')[0] ?? '';
    }

    const segments = parsed.pathname.split('/').filter(Boolean);
    const kind = segments[0];
    if (kind === 'shorts' || kind === 'embed' || kind === 'live' || kind === 'v') {
      return segments[1] ?? '';
    }

    return parsed.searchParams.get('v') ?? '';
  } catch {
    return '';
  }
}

/** @param {string} url */
function getYoutubeVideoId(url) {
  return parseYoutubeVideoId(url);
}

/** @param {string} url */
function extractYoutubeVideoId(url) {
  const id = parseYoutubeVideoId(url);
  return YOUTUBE_VIDEO_ID.test(id) ? id : null;
}

/** @param {string} id */
function isValidYoutubeVideoId(id) {
  return YOUTUBE_VIDEO_ID.test(id);
}

/**
 * @param {string} videoId
 * @param {'mq' | 'hq'} [quality]
 */
function youtubeThumbUrl(videoId, quality = 'mq') {
  const id = String(videoId || '').trim();
  if (!isValidYoutubeVideoId(id)) return null;
  const q = quality === 'hq' ? 'hqdefault' : 'mqdefault';
  return `https://i.ytimg.com/vi/${id}/${q}.jpg`;
}

globalThis.getYoutubeVideoId = getYoutubeVideoId;
globalThis.extractYoutubeVideoId = extractYoutubeVideoId;
globalThis.youtubeThumbUrl = youtubeThumbUrl;
globalThis.isValidYoutubeVideoId = isValidYoutubeVideoId;
