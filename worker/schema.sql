CREATE TABLE IF NOT EXISTS activation_codes (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  start_at INTEGER,
  expires_at INTEGER NOT NULL,
  notes TEXT,
  created_at INTEGER NOT NULL,
  redeemed_at INTEGER,
  redeemed_device_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_activation_codes_token_hash
  ON activation_codes(token_hash);

CREATE INDEX IF NOT EXISTS idx_activation_codes_redeemed_at
  ON activation_codes(redeemed_at);
