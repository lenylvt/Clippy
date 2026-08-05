import { MAX_CLIP_SECONDS, MAX_TITLE_LENGTH, MIN_CLIP_SECONDS } from './constants';

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

export function validateJobPayload(input: {
  videoId: string;
  videoTitle: string;
  youtubeUrl: string;
  clipStart: number;
  clipEnd: number;
}) {
  if (!input.videoId || !YOUTUBE_VIDEO_ID.test(input.videoId)) {
    return 'invalid_video_id' as const;
  }

  const urlVideoId = extractYoutubeVideoId(input.youtubeUrl);
  if (!urlVideoId || urlVideoId !== input.videoId) {
    return 'invalid_youtube_url' as const;
  }

  if (!input.videoTitle.trim()) {
    return 'invalid_title' as const;
  }

  if (input.videoTitle.length > MAX_TITLE_LENGTH) {
    return 'title_too_long' as const;
  }

  if (!Number.isFinite(input.clipStart) || !Number.isFinite(input.clipEnd) || input.clipEnd <= input.clipStart) {
    return 'invalid_range' as const;
  }

  const duration = input.clipEnd - input.clipStart;
  if (duration < MIN_CLIP_SECONDS) {
    return 'clip_too_short' as const;
  }
  if (duration > MAX_CLIP_SECONDS) {
    return 'clip_too_long' as const;
  }

  return null;
}
