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

Each release stays playable at `/v/<date>/`; `/versions/` lists them all.
