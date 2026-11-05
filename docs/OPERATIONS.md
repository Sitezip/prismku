# Operations

## Live
- Game: https://prismku.com (www redirects to apex via a zone Single Redirect rule)
- workers.dev: https://rainbow-sudoku.reply-c8b.workers.dev
- Worker: `rainbow-sudoku` · D1: `rainbow-sudoku-db` (`db3c2c9f-c4c6-425e-9699-0ea8250505a8`) · cron `5 0 * * *` (UTC)

## Daily improvement routine (noon America/Denver)
1. Review: `/api/stats`, leaderboards, Worker errors; play each difficulty on mobile.
2. Improve `client/` (+ `src/worker.js` / new `migrations/000N_*.sql` if needed).
3. Bump `version` in `client/config.js` and `CACHE` in `client/sw.js` to today (YYYY-MM-DD).
4. Add a CHANGELOG entry, then freeze: `node scripts/release.mjs YYYY-MM-DD "Title" "note|note"`.
5. Test: `npm test`, local `wrangler dev`, `test/api.test.mjs`, `test/ui.test.mjs`.
6. Deploy (one of):
   - **Git push to `main`** (Workers Builds: `npm test` → `npx wrangler deploy`) → `wrangler deploy` using `wrangler.toml` (real static assets).
   - **API-only** (agent connector, no token): `node scripts/build.mjs && node scripts/deploy-mcp.mjs`, then run the
     contents of `build/deploy-code.js` with the Cloudflare connector's `execute` tool. This "embedded" mode bundles
     `dist/` into the Worker (`src/embedded.js`) because the assets-upload JWT endpoint is not reachable from the connector.
   - New D1 migrations: run the SQL through `/d1/database/{id}/query` and insert the file name into `d1_migrations`.
7. When a fix for a player ticket is live, mark that ticket done with `node scripts/mark-feedback-done.mjs <id>` (below). That is what sends the one fix email. A raw SQL `UPDATE` does not.

Each release stays playable at `/v/<date>/`; `/versions/` lists them all.

## Player feedback tickets (D1 table `feedback`)
Players send tickets from the 💬 button (header), the footer link, `/#feedback`, or the win dialog.
`POST /api/feedback` validates type (bug|idea|other), message (5–1000 chars), and the optional email
(format only; blank is fine), drops honeypot
(`website`) submissions silently, and rate-limits per IP hash (5/minute, 20/day; only well-formed tickets count). The address is stored and used for a single note when that ticket is later marked fixed. Context JSON holds version,
mode, seed, daily/day, solved, elapsedMs, user agent, screen, viewport, path, theme, colorblind, language,
playerId (if registered) and country.

Read them with the Cloudflare connector: `POST /accounts/{account_id}/d1/database/db3c2c9f-c4c6-425e-9699-0ea8250505a8/query`
with `{"sql": "..."}`.

```sql
-- New tickets, newest first (times shown in UTC)
SELECT id, datetime(created_at/1000, 'unixepoch') AS created_utc, type, message, contact,
       json_extract(context, '$.version') AS version, json_extract(context, '$.mode') AS mode,
       json_extract(context, '$.seed') AS seed, json_extract(context, '$.viewport') AS viewport
FROM feedback WHERE status = 'new' ORDER BY created_at DESC LIMIT 50;

-- Full context for one ticket
SELECT * FROM feedback WHERE id = 1;

-- Counts by status / type
SELECT status, type, COUNT(*) FROM feedback GROUP BY status, type;

-- Triage (status: new | triaged | done | wontfix | spam).
-- Do not set status to done here. Use the mark-fixed path below so the email can go out.
UPDATE feedback SET status = 'triaged' WHERE id = 1;
```

## Mark a ticket fixed (one email)

When the fix is live, close the ticket through this path. `done` and `fixed` are the same. Any other status (`triaged`, `wontfix`, `spam`, `new`) only updates the row.

```bash
FEEDBACK_ADMIN_SECRET=... node scripts/mark-feedback-done.mjs 12
# or another status:
FEEDBACK_ADMIN_SECRET=... node scripts/mark-feedback-done.mjs 12 triaged
```

```bash
curl -sS -X POST https://prismku.com/api/admin/feedback/12 \
  -H "Authorization: Bearer $FEEDBACK_ADMIN_SECRET" \
  -H "content-type: application/json" \
  -d '{"status":"done"}'
```

The secret is the Worker secret `FEEDBACK_ADMIN_SECRET` (`npx wrangler secret put FEEDBACK_ADMIN_SECRET`). It is not in the repo. Wrangler deploys keep it. An MCP deploy from `scripts/deploy-mcp.mjs` replaces bindings and rotates `RL_SALT`, so put `FEEDBACK_ADMIN_SECRET` again after that path.

Mail is sent only to the address stored on that ticket, and only when the status changes to done/fixed. Each ticket is mailed at most once (`feedback_fix_email.sent_at`). Tickets that were already `done` when `migrations/0004_feedback_fix_email.sql` was applied are stored with `sent_at = 0` and are never mailed, even if marked done again. Successful sends are capped at 20 per hour; over the cap the ticket is left unchanged so a later call can still send. The message is plain text plus simple HTML, from `noreply@prismku.com`, with a short quote of the report, links to https://prismku.com and https://prismku.com/versions/, and a line that no further mail will be sent. Player text is not copied into headers.

`{"ok":true,"email":"sent"}` means the notice went out. `already-sent`, `skipped-already-done`, and `no-address` mean the status was saved and nothing was mailed. `email: "failed"` (HTTP 502) means the ticket is done but the send failed; call the same command again to retry that one notice.

## Abuse checks

```sql
-- Possible abuse: many tickets from one IP hash (hash rotates daily)
SELECT ip_hash, COUNT(*) n FROM feedback GROUP BY ip_hash HAVING n > 5 ORDER BY n DESC;

-- Fix notices (0 = already done before mail existed, never sent)
SELECT f.id, f.status, f.contact, e.sent_at
FROM feedback f LEFT JOIN feedback_fix_email e ON e.feedback_id = f.id
ORDER BY f.id DESC LIMIT 50;
```

## Anti-cheat clock (scores)
- `plays(player_id, mode, seed, started_at, finished_at)`: server stamps from `/api/play/start` (board first shown) and
  `/api/play/finish` (valid solved grid). `src/clock.js` `checkClock()` decides each submit:
  no start / span < floor → `ranked = 0, check_note = 'unverified'`; claim < span − 3s → `time_ms` = span − 3s,
  `check_note = 'clock'` (original claim in `client_ms`). Leaderboards, records, daily rank and speed badges use `ranked = 1` only.
- Floor: `max(mode.minMs, emptyTiles × 450ms)`. Cron deletes `plays` older than 30 days.
```sql
SELECT id, mode, daily_id, client_ms, time_ms, check_note, ranked FROM scores WHERE check_note IS NOT NULL ORDER BY id DESC LIMIT 50;
```
