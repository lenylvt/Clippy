-- Stable device public ids, pairing lookup index, global unique push tokens

ALTER TABLE devices ADD COLUMN device_id TEXT;

UPDATE devices
SET device_id = lower(
  hex(randomblob(4)) || '-' ||
  hex(randomblob(2)) || '-4' ||
  substr(hex(randomblob(2)), 2) || '-' ||
  substr('89ab', 1 + abs(random()) % 4, 1) ||
  substr(hex(randomblob(2)), 2) || '-' ||
  hex(randomblob(6))
)
WHERE device_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id);

CREATE INDEX IF NOT EXISTS idx_pairing_device ON pairing_codes(device_token);

-- One owner per Expo/APNs token (keep most recent rowid per token)
DELETE FROM push_tokens
WHERE rowid NOT IN (
  SELECT MAX(rowid) FROM push_tokens GROUP BY token
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_tokens_token ON push_tokens(token);
