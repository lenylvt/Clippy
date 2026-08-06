const YOUTUBE_VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

export function extractYoutubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.replace(/^\//, '').split('/')[0] ?? '';
      return YOUTUBE_VIDEO_ID.test(id) ? id : null;
    }
    if (parsed.pathname.startsWith('/shorts/')) {
      const id = parsed.pathname.split('/')[2] ?? '';
      return YOUTUBE_VIDEO_ID.test(id) ? id : null;
    }
    const id = parsed.searchParams.get('v') ?? '';
    return YOUTUBE_VIDEO_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** Loose parse for extension UI (accepts non-11-char ids). */
export function getYoutubeVideoId(url: string): string {
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

export function youtubeThumbUrl(videoId: string, quality: 'mq' | 'hq' = 'mq'): string | null {
  const id = String(videoId || '').trim();
  if (!id || id.length < 6) return null;
  const q = quality === 'hq' ? 'hqdefault' : 'mqdefault';
  return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/${q}.jpg`;
}

export function isValidYoutubeVideoId(id: string): boolean {
  return YOUTUBE_VIDEO_ID.test(id);
}
