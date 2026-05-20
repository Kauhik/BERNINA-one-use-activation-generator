CREATE TABLE IF NOT EXISTS activation_codes (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  start_at INTEGER,
  expires_at INTEGER NOT NULL,
  notes TEXT,
  created_at INTEGER NOT NULL,
  max_devices INTEGER NOT NULL DEFAULT 1,
  redeemed_at INTEGER,
  redeemed_device_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_activation_codes_token_hash
  ON activation_codes(token_hash);

CREATE INDEX IF NOT EXISTS idx_activation_codes_redeemed_at
  ON activation_codes(redeemed_at);

CREATE TABLE IF NOT EXISTS activation_code_redemptions (
  activation_code_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  redeemed_at INTEGER NOT NULL,
  PRIMARY KEY (activation_code_id, device_id),
  FOREIGN KEY (activation_code_id) REFERENCES activation_codes(id)
);

CREATE INDEX IF NOT EXISTS idx_activation_code_redemptions_code
  ON activation_code_redemptions(activation_code_id);
