/** @param {string} url */
function getYoutubeVideoId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace(/^\//, '').split('/')[0] ?? '';
    }
    return parsed.searchParams.get('v') ?? '';
  } catch {
    return '';
  }
}

/**
 * @param {string} videoId
 * @param {'mq' | 'hq'} [quality]
 */
function youtubeThumbUrl(videoId, quality = 'mq') {
  const id = String(videoId || '').trim();
  if (!id || id.length < 6) return null;
  const q = quality === 'hq' ? 'hqdefault' : 'mqdefault';
  return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/${q}.jpg`;
}

globalThis.getYoutubeVideoId = getYoutubeVideoId;
globalThis.youtubeThumbUrl = youtubeThumbUrl;
