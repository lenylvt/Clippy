CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  progress REAL NOT NULL DEFAULT 0,
  video_id TEXT NOT NULL,
  video_title TEXT NOT NULL,
  youtube_url TEXT NOT NULL,
  clip_start REAL NOT NULL,
  clip_end REAL NOT NULL,
  clip_id TEXT,
  error TEXT,
  device_token TEXT NOT NULL,
  slot INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_device ON jobs(device_token);
CREATE INDEX IF NOT EXISTS idx_jobs_updated ON jobs(updated_at DESC);
