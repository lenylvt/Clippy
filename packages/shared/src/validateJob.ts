import { MAX_CLIP_SECONDS, MAX_TITLE_LENGTH, MIN_CLIP_SECONDS } from './clipLimits';
import { extractYoutubeVideoId, isValidYoutubeVideoId } from './youtube';

export function validateJobPayload(input: {
  videoId: string;
  videoTitle: string;
  youtubeUrl: string;
  clipStart: number;
  clipEnd: number;
}) {
  if (!input.videoId || !isValidYoutubeVideoId(input.videoId)) {
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
