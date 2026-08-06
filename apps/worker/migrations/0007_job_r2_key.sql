-- Track intended R2 object while a job runs (recovery if DO dies after PUT).
ALTER TABLE jobs ADD COLUMN r2_key TEXT;
