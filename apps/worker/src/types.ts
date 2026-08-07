import type { Clip, JobPublic, JobStatus } from '@clippy/shared/types';
import type { JobStage } from './constants';

export type { Clip, JobPublic, JobStatus };
export type ClipRow = {
  id: string;
  video_id: string;
  video_title: string;
  youtube_url: string;
  r2_key: string;
  clip_start: number;
  clip_end: number;
  created_at: number;
  expires_at: number;
  user_id: string | null;
  video_duration: number | null;
};

export type JobRow = {
  id: string;
  status: JobStatus;
  stage: JobStage;
  progress: number;
  video_id: string;
  video_title: string;
  youtube_url: string;
  clip_start: number;
  clip_end: number;
  clip_id: string | null;
  error: string | null;
  /** Always set at insert (see migrations). */
  device_token: string;
  user_id: string | null;
  slot: number | null;
  r2_key: string | null;
  /** Present after migration 0009; treat missing as 0. */
  attempts?: number;
  /** Request origin at enqueue (migration 0009). */
  origin?: string | null;
  created_at: number;
  updated_at: number;
  expires_at: number;
};

export type UserRow = {
  id: string;
  email: string;
  created_at: number;
};

export type DeviceRow = {
  device_token: string;
  device_id: string | null;
  user_id: string | null;
  label: string | null;
  paired_at: number | null;
  created_at: number;
};

export type SendEmail = {
  send(message: {
    to: string | { email: string; name?: string };
    from: string | { email: string; name?: string };
    subject: string;
    html?: string;
    text?: string;
  }): Promise<{ messageId: string }>;
};

export type Env = {
  CLIPS: R2Bucket;
  DB: D1Database;
  /** ClipContainer DO namespace — prefer `getClipContainer(env, slot)`. */
  CLIP: DurableObjectNamespace;
  /** JobQueue singleton — prefer `getJobQueue(env)`. */
  JOB_QUEUE: DurableObjectNamespace;
  /**
   * Shared secret for Worker↔container and `/api/internal/*`.
   * Required at runtime — use `requireContainerSecret(env)`.
   * Set via: `wrangler secret put CONTAINER_SECRET`
   */
  CONTAINER_SECRET: string;
  /** Present in prod wrangler binding; optional in unit tests. */
  EMAIL?: SendEmail;
  /**
   * Comma-separated absolute origins allowed for CORS
   * (e.g. `https://clippy.example.com,https://clippy.…workers.dev`).
   * Localhost / 127.0.0.1 are always allowed for local dev.
   */
  PUBLIC_ORIGINS?: string;
  /** Chrome extension ID → allows only `chrome-extension://<id>` (32 chars a–p). */
  EXTENSION_ID?: string;
  /** Latest sideloaded extension version (must match packaged manifest + R2 zip). */
  EXTENSION_VERSION?: string;
  /**
   * Optional R2 S3 API credentials for container→R2 direct PUT.
   * Set via wrangler secrets / vars (see wrangler.jsonc comments):
   * - `R2_ACCOUNT_ID` (var or secret)
   * - `R2_ACCESS_KEY_ID` (secret)
   * - `R2_SECRET_ACCESS_KEY` (secret)
   */
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  /** Public worker origin for clip URLs in push payloads (no trailing slash). */
  PUBLIC_ORIGIN?: string;
  /** R2 bucket name for S3 presign (defaults to clippy-clips). */
  R2_BUCKET?: string;
  /** Optional Expo push access token (EAS enhanced push security). Set via secret. */
  EXPO_ACCESS_TOKEN?: string;
  /** Optional session/HMAC pepper; clip URL signing prefers this over CONTAINER_SECRET. */
  SESSION_SECRET?: string;
  OTP_PEPPER?: string;
  /** Static assets (Kumo install SPA under /install/). */
  ASSETS?: Fetcher;
};

/** Fail-fast when the worker is misconfigured without an internal secret. */
export function requireContainerSecret(env: Pick<Env, 'CONTAINER_SECRET'>): string {
  const secret = env.CONTAINER_SECRET;
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error('CONTAINER_SECRET_not_configured');
  }
  return secret;
}
