import { MAX_CLIP_SECONDS, MAX_TITLE_LENGTH, MIN_CLIP_SECONDS } from './clipLimits';
import { extractYoutubeVideoId, isValidYoutubeVideoId } from './youtube';

/** Discriminated error codes from {@link validateJobPayload}. */
export type JobValidationError =
  | 'invalid_video_id'
  | 'invalid_youtube_url'
  | 'invalid_title'
  | 'title_too_long'
  | 'invalid_range'
  | 'clip_too_short'
  | 'clip_too_long';

/**
 * Validate a create-job payload.
 * Error precedence: id → url → title → range (incl. clipStart &lt; 0) → too short → too long.
 * Fractional seconds are allowed; only finiteness / ordering / duration bounds are checked.
 */
export function validateJobPayload(input: {
  videoId: string;
  videoTitle: string;
  youtubeUrl: string;
  clipStart: number;
  clipEnd: number;
}): JobValidationError | null {
  if (typeof input.videoId !== 'string' || !isValidYoutubeVideoId(input.videoId)) {
    return 'invalid_video_id';
  }

  if (typeof input.youtubeUrl !== 'string') {
    return 'invalid_youtube_url';
  }
  const urlVideoId = extractYoutubeVideoId(input.youtubeUrl);
  if (!urlVideoId || urlVideoId !== input.videoId) {
    return 'invalid_youtube_url';
  }

  if (typeof input.videoTitle !== 'string') {
    return 'invalid_title';
  }
  const title = input.videoTitle.trim();
  if (!title) {
    return 'invalid_title';
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return 'title_too_long';
  }

  const { clipStart, clipEnd } = input;
  if (
    typeof clipStart !== 'number' ||
    typeof clipEnd !== 'number' ||
    !Number.isFinite(clipStart) ||
    !Number.isFinite(clipEnd) ||
    clipStart < 0 ||
    clipEnd <= clipStart
  ) {
    return 'invalid_range';
  }

  const duration = clipEnd - clipStart;
  if (duration < MIN_CLIP_SECONDS) {
    return 'clip_too_short';
  }
  if (duration > MAX_CLIP_SECONDS) {
    return 'clip_too_long';
  }

  return null;
}
