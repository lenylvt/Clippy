import {
  JOB_STAGES,
  type JobStage,
} from '@clippy/shared/stages';
import {
  MAX_CLIP_SECONDS,
  MAX_TITLE_LENGTH,
  MIN_CLIP_SECONDS,
} from '@clippy/shared/clipLimits';

export {
  JOB_STAGES,
  MAX_CLIP_SECONDS,
  MAX_TITLE_LENGTH,
  MIN_CLIP_SECONDS,
  type JobStage,
};

/** Must stay in sync with `containers[0].max_instances` in wrangler.jsonc. */
export const MAX_CONTAINER_SLOTS = 4;

/** Container HTTP listen port — must match Dockerfile `EXPOSE`. */
export const CONTAINER_PORT = 8080;

/** Max upload / clip object size (~100 MiB). */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export const DELETE_BATCH_SIZE = 20;

/** TTL for jobs (queued/running rows) and clip artifacts — same window. */
export const JOB_TTL_MS = 48 * 60 * 60 * 1000;
/** Alias: clip `expires_at` uses the same duration as jobs. */
export const CLIP_TTL_MS = JOB_TTL_MS;
/**
 * Running jobs with no progress heartbeat for this long are considered stuck.
 * Used by the JobQueue watchdog to requeue/restart — not by idle container stop.
 */
export const STALE_JOB_MS = 12 * 60 * 1000;
/** Bound claim races under contention; null only means empty queue. */
export const CLAIM_DEADLINE_MS = 5_000;
export const CLAIM_MAX_ATTEMPTS = 64;
export const DEFAULT_CLIPS_PAGE_LIMIT = 50;
export const DEFAULT_JOBS_PAGE_LIMIT = 50;

/** Concurrent queued|running jobs per user (create job → 429 when exceeded). */
export const MAX_ACTIVE_JOBS_PER_USER = 3;

/**
 * In-memory rate limits (per Worker isolate — best-effort).
 * Keys typically combine route + IP (+ email/token when available).
 */
export const RATE_LIMIT_OTP_REQUEST = { limit: 5, windowMs: 60_000 } as const;
export const RATE_LIMIT_OTP_VERIFY = { limit: 20, windowMs: 60_000 } as const;
export const RATE_LIMIT_PAIRING_START = { limit: 10, windowMs: 60_000 } as const;
export const RATE_LIMIT_PAIRING_CLAIM = { limit: 20, windowMs: 60_000 } as const;
export const RATE_LIMIT_CREATE_JOB = { limit: 12, windowMs: 60_000 } as const;

/** Deep-link scheme for pairing QR / claim. */
export const PAIRING_DEEP_LINK_PREFIX = 'clippy://pair?code=';

/** Max transient failures before a job becomes terminal error. */
export const MAX_JOB_ATTEMPTS = 3;
/** Abort container fetch + NDJSON stream after this (must be < STALE_JOB_MS). */
export const JOB_PROCESS_TIMEOUT_MS = 11 * 60 * 1000;
/**
 * Sentinel `jobId` for cron/admin pump-only enqueue — not a real jobs row.
 * `enqueue(CRON_PUMP_JOB_ID)` only schedules `#pump`.
 */
export const CRON_PUMP_JOB_ID = '__cron_pump__';
export const PROGRESS_MIN_DELTA = 0.01;
export const PROGRESS_WRITE_MIN_MS = 400;
export const ERROR_MESSAGE_MAX = 500;
/**
 * Watchdog alarm while work remains (supervisor tick).
 * Idle container stop is D1-driven (queued|running), not memory-runner-driven.
 */
export const QUEUE_WATCHDOG_MS = 30_000;
/** Renew ClipContainer sleepAfter while a long /process stream is open. */
export const CONTAINER_ACTIVITY_RENEW_MS = 60_000;
/**
 * Seconds before an active container may be rolled during deploy (SIGTERM).
 * Keep ≥ worst-case job duration so mid-job deploys do not kill downloads.
 */
export const CONTAINER_ROLLOUT_GRACE_S = 15 * 60;
/** Max NDJSON line size before abort (DoS / corrupt stream). */
export const PROCESS_STREAM_MAX_LINE_BYTES = 64 * 1024;
/** How long inline mode may wait for trailer EOF after `done`. */
export const PROCESS_STREAM_INLINE_EOF_MS = 120_000;

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const PAIRING_TTL_MS = 2 * 60 * 1000;

/** Must match wrangler `send_email.allowed_sender_addresses`. */
export const OTP_FROM_EMAIL = 'clippy@lenylvt.cc';
export const OTP_FROM_NAME = 'Clippy';

export function clipSlotName(slot: number): string {
  if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_CONTAINER_SLOTS) {
    throw new Error(`invalid_clip_slot:${slot}`);
  }
  return `slot-${slot}`;
}
