/** Keep in sync with @clippy/shared/clipLimits. */
(function () {
  const MIN_CLIP_SECONDS = 3;
  /** Max clip length for jobs / processing / options default duration. */
  const MAX_CLIP_SECONDS = 300;
  /** Aligned with MAX_CLIP_SECONDS so options cannot save an unusable default. */
  const MAX_CLIP_DURATION_OPTION = MAX_CLIP_SECONDS;
  const DEFAULT_CLIP_DURATION = 90;
  const MAX_TITLE_LENGTH = 200;

  globalThis.MIN_CLIP_SECONDS = MIN_CLIP_SECONDS;
  globalThis.MAX_CLIP_SECONDS = MAX_CLIP_SECONDS;
  globalThis.MAX_CLIP_DURATION_OPTION = MAX_CLIP_DURATION_OPTION;
  globalThis.DEFAULT_CLIP_DURATION = DEFAULT_CLIP_DURATION;
  globalThis.MAX_TITLE_LENGTH = MAX_TITLE_LENGTH;
})();
