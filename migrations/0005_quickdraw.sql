-- Quick Draw reaction mode (2026-11-12): server-dealt rounds with server reveal/finish stamps.
CREATE TABLE IF NOT EXISTS quickdraw_rounds (
  id TEXT PRIMARY KEY,                 -- random round id
  player_id TEXT NOT NULL,             -- client UUID
  created_at INTEGER NOT NULL,
  reveal_at INTEGER NOT NULL,          -- earliest server ms the board may be revealed (random wait)
  revealed_at INTEGER,                 -- server ms the board was actually sent
  finished_at INTEGER,
  board TEXT NOT NULL,                 -- 4 digits, 0 = the empty tile
  answer INTEGER NOT NULL,
  status TEXT NOT NULL,                -- open | done | rejected | false-start
  ms INTEGER,                          -- final time incl. penalty (server-checked)
  ranked INTEGER NOT NULL DEFAULT 0,   -- 1 = registered player, eligible for leaderboards
  day TEXT,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_qd_board ON quickdraw_rounds(status, ranked, day, ms);
CREATE INDEX IF NOT EXISTS idx_qd_player ON quickdraw_rounds(player_id, status);
INSERT OR REPLACE INTO schema_meta VALUES ('version', '5');
