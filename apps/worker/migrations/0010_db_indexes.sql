-- Hot-path composite indexes for jobs / clips listing & claim / stale reap.
CREATE INDEX IF NOT EXISTS idx_jobs_status_expires_created
  ON jobs(status, expires_at, created_at);

CREATE INDEX IF NOT EXISTS idx_jobs_status_updated
  ON jobs(status, updated_at);

CREATE INDEX IF NOT EXISTS idx_jobs_user_status_expires
  ON jobs(user_id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_clips_user_expires_created
  ON clips(user_id, expires_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clips_expires_created
  ON clips(expires_at, created_at DESC);
