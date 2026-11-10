// Prismku puzzle engine — shared by the browser and the Worker (server-side verification).
// Grids are flat arrays of length n*n; 0 = empty, 1..n = colour index.

export const MODES = {
  easy:   { key: 'easy',   label: 'Easy',   size: 4, box: [2, 2], clues: 7,  base: 500,  par: 25,  minMs: 2500 },
  medium: { key: 'medium', label: 'Medium', size: 5, box: null,   clues: 10, base: 900,  par: 60,  minMs: 5000 },
  hard:   { key: 'hard',   label: 'Hard',   size: 6, box: [2, 3], clues: 14, base: 1500, par: 120, minMs: 9000 },
  expert: { key: 'expert', label: 'Expert', size: 9, box: [3, 3], clues: 30, base: 4000, par: 540, minMs: 30000 },
};
export const MODE_KEYS = Object.keys(MODES);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function dailySeed(date, mode) { return hashString(`prismku-daily-${date}-${mode}`); }

function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

export function regionOf(idx, mode) {
  const m = typeof mode === 'string' ? MODES[mode] : mode;
  if (!m.box) return -1;
  const n = m.size, [bh, bw] = m.box;
  const r = Math.floor(idx / n), c = idx % n;
  return Math.floor(r / bh) * (n / bw) + Math.floor(c / bw);
}

// Peers: cells sharing a row, column or region.
const peerCache = new Map();
export function peers(mode) {
  const m = typeof mode === 'string' ? MODES[mode] : mode;
  if (peerCache.has(m.key)) return peerCache.get(m.key);
  const n = m.size, out = [];
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n), c = i % n, reg = regionOf(i, m), set = new Set();
    for (let j = 0; j < n * n; j++) {
      if (j === i) continue;
      if (Math.floor(j / n) === r || j % n === c || (reg >= 0 && regionOf(j, m) === reg)) set.add(j);
    }
    out.push([...set]);
  }
  peerCache.set(m.key, out);
  return out;
}

// Count solutions up to `limit` using bitmask backtracking with MRV.
export function countSolutions(grid, mode, limit = 2) {
  const m = typeof mode === 'string' ? MODES[mode] : mode;
  const n = m.size, P = peers(m), g = grid.slice(), full = (1 << (n + 1)) - 2;
  let count = 0;
  function cand(i) { let used = 0; for (const p of P[i]) if (g[p]) used |= 1 << g[p]; return full & ~used; }
  function rec() {
    let best = -1, bestMask = 0, bestCnt = 99;
    for (let i = 0; i < g.length; i++) {
      if (g[i]) continue;
      const mask = cand(i); let c = 0; for (let v = mask; v; v &= v - 1) c++;
      if (c === 0) return;
      if (c < bestCnt) { best = i; bestMask = mask; bestCnt = c; if (c === 1) break; }
    }
    if (best < 0) { count++; return; }
    for (let v = 1; v <= n; v++) {
      if (!(bestMask & (1 << v))) continue;
      g[best] = v; rec(); g[best] = 0;
      if (count >= limit) return;
    }
  }
  rec();
  return count;
}

function fillRandom(mode, rnd) {
  const m = mode, n = m.size, P = peers(m), g = new Array(n * n).fill(0);
  function rec(i) {
    if (i === g.length) return true;
    const vals = shuffle([...Array(n)].map((_, k) => k + 1), rnd);
    for (const v of vals) {
      let ok = true; for (const p of P[i]) if (g[p] === v) { ok = false; break; }
      if (!ok) continue;
      g[i] = v; if (rec(i + 1)) return true; g[i] = 0;
    }
    return false;
  }
  rec(0);
  return g;
}

// Deterministic: same (mode, seed) => same puzzle everywhere.
export function generate(modeKey, seed) {
  const m = MODES[modeKey];
  if (!m) throw new Error('bad mode');
  const rnd = mulberry32(seed);
  const solution = fillRandom(m, rnd);
  const puzzle = solution.slice();
  const order = shuffle([...Array(puzzle.length).keys()], rnd);
  let filled = puzzle.length;
  for (const idx of order) {
    if (filled <= m.clues) break;
    const keep = puzzle[idx];
    puzzle[idx] = 0;
    if (countSolutions(puzzle, m, 2) !== 1) puzzle[idx] = keep; else filled--;
  }
  return { mode: modeKey, size: m.size, seed: seed >>> 0, puzzle, solution };
}

export function conflicts(grid, modeKey) {
  const P = peers(modeKey), bad = new Set();
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i]) continue;
    for (const p of P[i]) if (grid[p] === grid[i]) { bad.add(i); bad.add(p); }
  }
  return bad;
}

// A complete grid that respects the givens and has no conflicts is THE solution (puzzles are unique).
export function isSolved(grid, puzzle, modeKey) {
  if (grid.length !== puzzle.length) return false;
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i]) return false;
    if (puzzle[i] && puzzle[i] !== grid[i]) return false;
  }
  return conflicts(grid, modeKey).size === 0;
}

export function computeScore(modeKey, timeMs, hints, mistakes) {
  const m = MODES[modeKey];
  const adj = timeMs / 1000 + hints * 15 + mistakes * 3;
  const ratio = Math.min(2.5, m.par / Math.max(1, adj));
  return Math.max(10, Math.round(m.base * ratio));
}

export function gridToString(g) { return g.map(v => v.toString(36)).join(''); }
export function stringToGrid(s) { return [...s].map(ch => parseInt(ch, 36)); }
