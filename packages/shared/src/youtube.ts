const YOUTUBE_VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

/** Hosts accepted for YouTube URLs (exact label match / DNS suffix). */
function isYoutubeHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'youtu.be' || host.endsWith('.youtu.be')) return true;
  if (host === 'youtube.com' || host.endsWith('.youtube.com')) return true;
  if (host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com')) return true;
  return false;
}

/** Defensive: youtu.be/ID&t=1 → treat first & as query separator. */
function normalizeYoutubeUrlInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  // Soft-accept scheme-less URLs used in paste / share sheets.
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

/**
 * Raw id from a YouTube URL (watch / shorts / embed / live / v / youtu.be).
 * Empty string when host is not YouTube or no id found.
 */
function parseYoutubeVideoId(url: string): string {
  try {
    let input = normalizeYoutubeUrlInput(url);
    // youtu.be/ID&t=1 (missing ?) — common share typo
    const amp = input.indexOf('&');
    const q = input.indexOf('?');
    if (amp !== -1 && (q === -1 || amp < q)) {
      input = `${input.slice(0, amp)}?${input.slice(amp + 1)}`;
    }

    const parsed = new URL(input);
    if (!isYoutubeHost(parsed.hostname)) return '';

    const host = parsed.hostname.toLowerCase();
    if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
      const id = parsed.pathname.replace(/^\//, '').split('/')[0] ?? '';
      return id;
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

/** Strict: only valid 11-char ids on allowlisted YouTube hosts. */
export function extractYoutubeVideoId(url: string): string | null {
  const id = parseYoutubeVideoId(url);
  return YOUTUBE_VIDEO_ID.test(id) ? id : null;
}

/** Loose parse for extension UI (same paths; accepts non-11-char ids). */
export function getYoutubeVideoId(url: string): string {
  return parseYoutubeVideoId(url);
}

export function youtubeThumbUrl(videoId: string, quality: 'mq' | 'hq' = 'mq'): string | null {
  const id = String(videoId || '').trim();
  if (!isValidYoutubeVideoId(id)) return null;
  const q = quality === 'hq' ? 'hqdefault' : 'mqdefault';
  return `https://i.ytimg.com/vi/${id}/${q}.jpg`;
}

export function isValidYoutubeVideoId(id: string): boolean {
  return YOUTUBE_VIDEO_ID.test(id);
}
