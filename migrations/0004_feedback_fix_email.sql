-- One fix-notification per feedback ticket.
-- sent_at: 0 = ticket was already done before this migration (never email);
--          > 0 = ms timestamp of the single notice;
--          < 0 = a send is in progress (−ms).
-- Idempotent: safe to run again. Existing notices are not reset, and tickets
-- that were already done stay suppressed.
CREATE TABLE IF NOT EXISTS feedback_fix_email (
  feedback_id INTEGER PRIMARY KEY,
  sent_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO feedback_fix_email (feedback_id, sent_at)
SELECT id, 0 FROM feedback WHERE status = 'done';
INSERT OR REPLACE INTO schema_meta VALUES ('version', '4');
