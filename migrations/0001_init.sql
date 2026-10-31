-- Prismku (Rainbow Sudoku) D1 schema v1
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,               -- anonymous client-generated UUID
  secret_hash TEXT NOT NULL,         -- sha256 of client secret (proves ownership of id)
  nickname TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  games INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS daily_puzzles (
  id TEXT PRIMARY KEY,               -- 'YYYY-MM-DD:mode'
  day TEXT NOT NULL,
  mode TEXT NOT NULL,
  size INTEGER NOT NULL,
  seed INTEGER NOT NULL,
  puzzle TEXT NOT NULL,
  number INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL REFERENCES players(id),
  mode TEXT NOT NULL,
  size INTEGER NOT NULL,
  seed INTEGER NOT NULL,
  daily_id TEXT,                     -- NULL for free play
  time_ms INTEGER NOT NULL,
  moves INTEGER NOT NULL,
  hints INTEGER NOT NULL,
  mistakes INTEGER NOT NULL,
  score INTEGER NOT NULL,
  version TEXT NOT NULL,
  day TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scores_mode_score ON scores(mode, score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_daily ON scores(daily_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_player ON scores(player_id, mode);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_one_daily ON scores(player_id, daily_id) WHERE daily_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS achievements (
  player_id TEXT NOT NULL,
  code TEXT NOT NULL,
  earned_at INTEGER NOT NULL,
  score_id INTEGER,
  PRIMARY KEY (player_id, code)
);
CREATE TABLE IF NOT EXISTS highlights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT,
  nickname TEXT,
  kind TEXT NOT NULL,                -- achievement | record | daily_top
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_highlights_time ON highlights(created_at DESC);
CREATE TABLE IF NOT EXISTS community_stats (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,              -- iphash:action:window
  window INTEGER NOT NULL,
  count INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rl_window ON rate_limits(window);
CREATE TABLE IF NOT EXISTS schema_meta (k TEXT PRIMARY KEY, v TEXT);
INSERT OR REPLACE INTO schema_meta VALUES ('version', '1');
