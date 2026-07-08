CREATE TABLE IF NOT EXISTS clips (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL,
  video_title TEXT NOT NULL,
  youtube_url TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  clip_start REAL NOT NULL,
  clip_end REAL NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clips_video_id ON clips(video_id);
CREATE INDEX IF NOT EXISTS idx_clips_created_at ON clips(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clips_expires_at ON clips(expires_at);
