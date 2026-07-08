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
};

export type VideoGroup = {
  videoId: string;
  videoTitle: string;
  youtubeUrl: string;
  latestAt: number;
  clips: Clip[];
};

export type Env = {
  CLIPS: R2Bucket;
  DB: D1Database;
};
