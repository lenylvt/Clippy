import type { JobStage } from './stages';

/**
 * Lifecycle status on the job row (worker queue), distinct from {@link JobStage}.
 * - `queued` / `running` — active
 * - `done` / `error` — terminal
 */
export type JobStatus = 'queued' | 'running' | 'done' | 'error';

export type ClipExtension = 'mp4' | 'webm';

export type Clip = {
  id: string;
  videoId: string;
  videoTitle: string;
  youtubeUrl: string;
  clipStart: number;
  clipEnd: number;
  /** Probed media duration in seconds; `null` when unknown. */
  videoDuration: number | null;
  createdAt: number;
  expiresAt: number;
  url: string;
  extension: ClipExtension;
};

export type Job = {
  id: string;
  /** Queue lifecycle — see {@link JobStatus}. */
  status: JobStatus;
  /** Pipeline step — see {@link JobStage}. */
  stage: JobStage;
  /** Progress in \[0, 1\]. */
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
  /** Present once a clip was produced (`clipId` set). */
  url?: string;
};

/** Public job DTO (same shape as {@link Job} for API responses). */
export type JobPublic = Job;

export type { JobStage };
