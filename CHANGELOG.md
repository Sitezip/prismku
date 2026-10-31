# Changelog

Every release is frozen and playable at `/v/<date>/` (see `/versions/`).

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
