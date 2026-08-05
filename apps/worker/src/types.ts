import type { JobStage } from './constants';

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
};

export type Clip = {
  id: string;
  videoId: string;
  videoTitle: string;
  youtubeUrl: string;
  clipStart: number;
  clipEnd: number;
  createdAt: number;
  expiresAt: number;
  url: string;
  extension: 'mp4' | 'webm';
};

export type VideoGroup = {
  videoId: string;
  videoTitle: string;
  youtubeUrl: string;
  latestAt: number;
  clips: Clip[];
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
  slot: number | null;
  created_at: number;
  updated_at: number;
  expires_at: number;
};

export type JobPublic = {
  id: string;
  status: string;
  stage: string;
  progress: number;
  videoId: string;
  videoTitle: string;
  youtubeUrl: string;
  clipStart: number;
  clipEnd: number;
  clipId: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  url?: string;
  galleryUrl?: string;
};

export type Env = {
  CLIPS: R2Bucket;
  DB: D1Database;
  CLIP: DurableObjectNamespace;
  JOB_QUEUE: DurableObjectNamespace;
  CONTAINER_SECRET: string;
};
