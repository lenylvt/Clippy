/** Stable marker so review demo jobs are never claimed or watchdog-reaped. */
export const REVIEW_DEVICE_TOKEN = 'clippy-app-store-review';

/** Stored on review demo jobs (`jobs.origin`). */
export const REVIEW_ORIGIN = 'app-store-review';

/** Clip / job TTL for App Store review fixtures (~1 year). */
export const REVIEW_ARTIFACT_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/** Fixed R2 key for the playable review clip. */
export const REVIEW_CLIP_R2_KEY = 'review/demo-clip.mp4';

/** Deterministic UUIDs so re-seed is idempotent. */
export const REVIEW_CLIP_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0001';
export const REVIEW_JOB_IDS = {
  queued: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0101',
  downloading: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0102',
  cropping: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0103',
  error: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0104',
} as const;
