-- Server-side solve clock (anti "pause and solve on paper" exploit, 2026-11-01)
CREATE TABLE IF NOT EXISTS plays (
  player_id TEXT NOT NULL,             -- client UUID (registered or not)
  mode TEXT NOT NULL,
  seed INTEGER NOT NULL,
  started_at INTEGER NOT NULL,         -- server ms when the board was first shown to this player
  finished_at INTEGER,                 -- server ms when a solved grid was first reported
  PRIMARY KEY (player_id, mode, seed)
);
CREATE INDEX IF NOT EXISTS idx_plays_started ON plays(started_at);
ALTER TABLE scores ADD COLUMN ranked INTEGER NOT NULL DEFAULT 1;  -- 0 = kept off leaderboards
ALTER TABLE scores ADD COLUMN client_ms INTEGER;                   -- time the client claimed (time_ms may be server-corrected)
ALTER TABLE scores ADD COLUMN check_note TEXT;                     -- null | clock | unverified
INSERT OR REPLACE INTO schema_meta VALUES ('version', '3');
