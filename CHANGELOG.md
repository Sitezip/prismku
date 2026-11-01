# Changelog

Every release is frozen and playable at `/v/<date>/` (see `/versions/`).

## 2026-11-01 — "Fair Clock"
- The clock now pauses whenever a dialog is open (how-to, leaderboards, profile, feedback) or the tab is hidden, and the board blurs while paused so it can't be studied off the clock. First-time players read the rules at 0:00 (ticket #3).
- Fixed (ticket #2): on Easy the first row could render shorter than the others, so the box divider cut through tiles instead of the gap. Rows are now always equal and dividers sit exactly between boxes on every size.
- New "How to play Rainbow Sudoku" guide at /how-to-play/ with rules, strategy tips and FAQ markup for search, linked from the footer and sitemap.

## 2026-10-31 — "Pencil Marks"
- New ✏️ Notes mode: drop tiny color dots in empty tiles to track candidates; placing a color wipes that dot from its row, column and box. Keyboard: N toggles, Shift+number marks. Notes are saved with your progress.
- Fixed (issue #2): switching board sizes could leave stale tiles painted over some rows until the next tap; each size now gets a fresh, paint-isolated board.
- Fixed (issue #1): leaderboard close button is now a larger, always-on-top target that closes reliably; quick tab switching no longer shows stale results; boards refresh right after you submit a score; ties sort by fastest time; the win dialog shows the board for the day you actually played; hint counts shown next to names.
- Mobile: the five game controls fit on one row on small phones.

## 2026-10-30 — Release 1: "First Light"
- Rainbow Sudoku core: Easy 4×4, Medium 5×5, Hard 6×6, Expert 9×9 with unique-solution generator.
- Daily puzzle shared worldwide (UTC), endless free play.
- Timer, moves, hints (+15s), clash highlighting (+3s), undo, restart, keyboard controls.
- Glowing tiles, rotating rainbow frame, shifting patterns, win wave + confetti, sound effects with toggle.
- Colorblind symbols, Classic/Neon/Pastel themes (Pro themes stubbed behind a flag).
- Spoiler-free emoji share grid.
- D1-backed nicknames, server-verified scores, daily/weekly/all-time leaderboards, achievements, community highlights.
- PWA manifest, offline service worker, OG card, SEO metadata, version archive.
- In-game feedback & bug reports (💬 button, footer link, win dialog): bug / idea / other, optional email, auto-attached context, stored in D1 (`feedback` table) with rate limiting and a honeypot.
