-- Player feedback / bug-report tickets
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,          -- ms since epoch (UTC)
  type TEXT NOT NULL CHECK (type IN ('bug', 'idea', 'other')),
  message TEXT NOT NULL,
  contact TEXT,                         -- optional email
  context TEXT NOT NULL DEFAULT '{}',   -- JSON: version, mode, seed, daily, ua, screen, url, playerId
  status TEXT NOT NULL DEFAULT 'new',   -- new | triaged | done | wontfix | spam
  ip_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at DESC);
INSERT OR REPLACE INTO schema_meta VALUES ('version', '2');
