-- ActivityKit: keep per-activity update token + push-to-start token separately.
-- (Table dropped in 0006 — kept for migration history on already-applied DBs.)
ALTER TABLE live_activity_tokens ADD COLUMN push_to_start_token TEXT;
