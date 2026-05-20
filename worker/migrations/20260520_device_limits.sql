ALTER TABLE activation_codes
ADD COLUMN max_devices INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS activation_code_redemptions (
  activation_code_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  redeemed_at INTEGER NOT NULL,
  PRIMARY KEY (activation_code_id, device_id),
  FOREIGN KEY (activation_code_id) REFERENCES activation_codes(id)
);

CREATE INDEX IF NOT EXISTS idx_activation_code_redemptions_code
  ON activation_code_redemptions(activation_code_id);

INSERT OR IGNORE INTO activation_code_redemptions (
  activation_code_id,
  device_id,
  redeemed_at
)
SELECT
  id,
  redeemed_device_id,
  redeemed_at
FROM activation_codes
WHERE redeemed_device_id IS NOT NULL
  AND redeemed_at IS NOT NULL;
