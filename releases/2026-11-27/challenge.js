// Challenge links (2026-11-16 "Dare"): share a Free play board as prismku.com/c/<code> so a friend plays the
// exact same puzzle and races your time. Pure helpers, unit-tested in test/challenge.test.mjs.
// Code: <mode letter><seed base36>[-<time ms base36>], e.g. "h1z141z3-1s0" = Hard, seed 0x...
const LETTER = { easy: 'e', medium: 'm', hard: 'h', expert: 'x' };
const MODE_OF = Object.fromEntries(Object.entries(LETTER).map(([k, v]) => [v, k]));
const MAX_MS = 24 * 3600 * 1000;

export function encodeChallenge({ mode, seed, ms }) {
  if (!LETTER[mode] || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null;
  const t = Number.isFinite(ms) && ms > 0 && ms < MAX_MS ? '-' + Math.round(ms).toString(36) : '';
  return LETTER[mode] + seed.toString(36) + t;
}

export function decodeChallenge(code) {
  const m = /^([emhx])([0-9a-z]{1,7})(?:-([0-9a-z]{1,6}))?$/.exec(String(code || '').toLowerCase());
  if (!m) return null;
  const seed = parseInt(m[2], 36);
  if (!Number.isInteger(seed) || seed > 0xffffffff) return null;
  let ms = m[3] ? parseInt(m[3], 36) : null;
  if (!(ms > 0 && ms < MAX_MS)) ms = null;
  return { mode: MODE_OF[m[1]], seed, ms };
}

// Reads a challenge from /c/<code> (link preview path) or ?c=<code>.
export function challengeFromLocation(pathname, search) {
  const p = /^\/c\/([^/]+)\/?$/.exec(pathname || '');
  if (p) return decodeChallenge(decodeURIComponent(p[1]));
  const q = new URLSearchParams(search || '').get('c');
  return q ? decodeChallenge(q) : null;
}

export function challengeUrl(site, g) {
  const code = encodeChallenge(g);
  return code ? `${site.replace(/\/$/, '')}/c/${code}` : null;
}

// How a finished time compares with the challenger's: { won, tie, diff } (diff in ms, always >= 0).
export function challengeVerdict(myMs, theirMs) {
  if (!(theirMs > 0) || !(myMs >= 0)) return null;
  const diff = Math.abs(myMs - theirMs);
  return { won: myMs < theirMs && diff >= 100, tie: diff < 100, diff };
}
// Margin for the verdict line: tenths under a minute ("2.4s"), m:ss above.
export function marginText(ms) { return ms < 60000 ? `${(Math.floor(ms / 100) / 10).toFixed(1)}s` : clock(ms); }

// Text for link previews (worker) and the in-game banner.
const LABEL = { easy: 'Easy 4×4', medium: 'Medium 5×5', hard: 'Hard 6×6', expert: 'Expert 9×9' };
export function clock(ms) { const s = Math.floor(ms / 1000), m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`; }
export function challengeTitle(c) {
  return c.ms ? `Can you beat ${clock(c.ms)} on this Prismku ${LABEL[c.mode]}?` : `Try this Prismku ${LABEL[c.mode]} board`;
}

// A device that already played this exact board has seen it: its run is practice (same rule as Fresh Start).
export function rememberSeed(list, mode, seed, cap = 100) {
  const k = `${mode}:${seed}`; const out = (Array.isArray(list) ? list : []).filter(x => x !== k); out.push(k);
  return out.slice(-cap);
}
export function seenSeed(list, mode, seed) { return Array.isArray(list) && list.includes(`${mode}:${seed}`); }
