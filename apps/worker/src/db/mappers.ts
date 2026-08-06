import {
  buildSignedClipUrl,
  clipSigningSecret,
  type ClipSignEnv,
} from '../http/clipUrl';
import type { Clip, ClipRow, JobPublic, JobRow } from '../types';

export function normalizePositiveDuration(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

export function extensionFromR2Key(r2Key: string): 'mp4' | 'webm' {
  return r2Key.toLowerCase().endsWith('.webm') ? 'webm' : 'mp4';
}

export async function rowToClip(
  row: ClipRow,
  origin: string,
  env: ClipSignEnv,
): Promise<Clip> {
  const secret = clipSigningSecret(env);
  return {
    id: row.id,
    videoId: row.video_id,
    videoTitle: row.video_title,
    youtubeUrl: row.youtube_url,
    clipStart: row.clip_start,
    clipEnd: row.clip_end,
    videoDuration: normalizePositiveDuration(row.video_duration),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    url: await buildSignedClipUrl(origin, row.id, secret, row.expires_at),
    extension: extensionFromR2Key(row.r2_key),
  };
}

export async function rowToJob(
  row: JobRow,
  origin: string,
  env: ClipSignEnv,
): Promise<JobPublic> {
  const job: JobPublic = {
    id: row.id,
    status: row.status,
    stage: row.stage,
    progress: row.progress,
    videoId: row.video_id,
    videoTitle: row.video_title,
    youtubeUrl: row.youtube_url,
    clipStart: row.clip_start,
    clipEnd: row.clip_end,
    clipId: row.clip_id,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.clip_id) {
    const secret = clipSigningSecret(env);
    const exp = row.expires_at > Date.now() ? row.expires_at : Date.now() + 60_000;
    job.url = await buildSignedClipUrl(origin, row.clip_id, secret, exp);
  }
  return job;
}

/** Status guard for terminal / mid-run job patches (mirrors SQL WHERE). */
export function allowedStatusesForJobPatch(nextStatus: string | undefined): readonly string[] {
  if (nextStatus === 'done') return ['running'];
  if (nextStatus === 'error') return ['queued', 'running'];
  return ['running'];
}
