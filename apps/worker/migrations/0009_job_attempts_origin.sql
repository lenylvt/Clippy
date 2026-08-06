-- Retry counter + optional request origin for push clip URLs.
ALTER TABLE jobs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN origin TEXT;
