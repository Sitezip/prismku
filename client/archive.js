// Daily archive (2026-11-27 "Daily Archive"): every past daily has a public page at /daily/<YYYY-MM-DD>/ and a
// deep link back into the game (/?replay=<day>&mode=<mode>). Pure helpers shared by the Worker and the browser,
// unit-tested in test/archive.test.mjs.
import { MODES, MODE_KEYS, generate, dailySeed } from './puzzle.js';

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const addDay = (day, k) => new Date(Date.parse(day) + k * 86400000).toISOString().slice(0, 10);
export function validDay(d) {
  if (typeof d !== 'string' || !DAY_RE.test(d)) return false;
  const t = Date.parse(d);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d;
}
export const inArchive = (day, launch, today) => validDay(day) && day >= launch && day <= today;

// Every daily from launch to today, newest first.
export function archiveDays(launch, today) {
  const out = [];
  for (let d = today; d >= launch; d = addDay(d, -1)) out.push(d);
  return out;
}

// /daily/... → what to serve. Bare paths redirect to the trailing-slash form so each page has one URL.
export function parseArchivePath(pathname) {
  if (pathname === '/daily') return { kind: 'redirect', to: '/daily/' };
  if (pathname === '/daily/') return { kind: 'index' };
  if (pathname === '/daily/sitemap.xml') return { kind: 'sitemap' };
  const m = /^\/daily\/(\d{4}-\d{2}-\d{2})(\/?)$/.exec(pathname);
  if (!m || !validDay(m[1])) return null;
  return m[2] ? { kind: 'day', day: m[1] } : { kind: 'redirect', to: `/daily/${m[1]}/` };
}

export const archivePlayHref = (day, mode) => `/?replay=${day}&mode=${mode}`;

// ?replay=<day>&mode=<mode> on the game page. Returns { day, mode, today } or null for anything out of range.
export function replayFromSearch(search, launch, today) {
  const q = new URLSearchParams(search || '');
  const day = q.get('replay');
  if (!inArchive(day, launch, today)) return null;
  const mode = MODES[q.get('mode')] ? q.get('mode') : 'easy';
  return { day, mode, today: day === today };
}

// The four boards of one day, exactly as the game deals them (same seed → same puzzle and answer).
export function dayBoards(day) {
  return MODE_KEYS.map(mode => {
    const m = MODES[mode], g = generate(mode, dailySeed(day, mode));
    return { mode, label: m.label, size: m.size, box: m.box, seed: g.seed, puzzle: g.puzzle, solution: g.solution,
      empty: g.puzzle.filter(v => !v).length };
  });
}

export function longDate(day) {
  return new Date(Date.parse(day)).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}
