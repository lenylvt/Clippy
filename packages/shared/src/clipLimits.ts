/** Minimum allowed clip length (seconds) for jobs and the editor. */
export const MIN_CLIP_SECONDS = 3;

/** Maximum clip length accepted by job validation / processing (seconds). */
export const MAX_CLIP_SECONDS = 300;

/** Max length of `videoTitle` on create-job (characters). */
export const MAX_TITLE_LENGTH = 200;

/**
 * Upper bound for the extension duration picker (seconds).
 * Aligned with {@link MAX_CLIP_SECONDS} so saved defaults remain valid for jobs.
 */
export const MAX_CLIP_DURATION_OPTION = MAX_CLIP_SECONDS;
