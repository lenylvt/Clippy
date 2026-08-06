import type { Clip, JobPublic } from '@clippy/shared/types';
import type { JobStage } from './constants';

export type { Clip, JobPublic };

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
  status: string;
  stage: JobStage | string;
  progress: number;
  video_id: string;
  video_title: string;
  youtube_url: string;
  clip_start: number;
  clip_end: number;
  clip_id: string | null;
  error: string | null;
  device_token: string;
  user_id: string | null;
  slot: number | null;
  r2_key: string | null;
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
  CLIP: DurableObjectNamespace;
  JOB_QUEUE: DurableObjectNamespace;
  CONTAINER_SECRET: string;
  EMAIL?: SendEmail;
  /** Optional R2 S3 API credentials for container→R2 direct PUT. */
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
};
