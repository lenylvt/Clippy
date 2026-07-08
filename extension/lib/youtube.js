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

globalThis.getYoutubeVideoId = getYoutubeVideoId;
