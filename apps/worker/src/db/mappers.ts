import type { Clip, ClipRow, JobPublic, JobRow } from '../types';

function extensionFromR2Key(r2Key: string): 'mp4' | 'webm' {
  return r2Key.endsWith('.mp4') ? 'mp4' : 'webm';
}

export function rowToClip(row: ClipRow, origin: string): Clip {
  const duration =
    row.video_duration != null && Number.isFinite(row.video_duration) && row.video_duration > 0
      ? row.video_duration
      : null;
  return {
    id: row.id,
    videoId: row.video_id,
    videoTitle: row.video_title,
    youtubeUrl: row.youtube_url,
    clipStart: row.clip_start,
    clipEnd: row.clip_end,
    videoDuration: duration,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    url: `${origin}/clips/${row.id}`,
    extension: extensionFromR2Key(row.r2_key),
  };
}

export function rowToJob(row: JobRow, origin: string): JobPublic {
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
    job.url = `${origin}/clips/${row.clip_id}`;
  }
  return job;
}
