// 🎞️ Solve replay (pure, testable). Every change to a tile is logged as [ms, tile, color, hint?1:0]
// (ms = game clock when it happened; color 0 = erased). After a win the log plays back on a mini board.
export const LOG_CAP = 800;
export function logMove(log, ms, i, v, hint = false) {
  log.push([Math.max(0, Math.round(ms) || 0), i, v, hint ? 1 : 0]);
  if (log.length > LOG_CAP) log.splice(0, log.length - LOG_CAP);
  return log;
}
// Board after the first k logged changes.
export function boardAt(puzzle, log, k = log.length) {
  const g = puzzle.slice();
  for (const [, i, v] of log.slice(0, k)) if (!puzzle[i]) g[i] = v;
  return g;
}
// A log can be replayed only if it rebuilds the solved board from the starting tiles
// (old saves and logs trimmed by the cap can't, so no Replay button for those).
export function replayable(puzzle, solution, log) {
  if (!Array.isArray(log) || !log.length || log.length >= LOG_CAP) return false;
  if (!log.every(e => Array.isArray(e) && e.length >= 3 && Number.isInteger(e[1]) && e[1] >= 0 && e[1] < puzzle.length)) return false;
  return boardAt(puzzle, log).every((v, i) => v === solution[i]);
}
// Playback times (ms from start) for each step. Keeps the rhythm of the real solve, but long thinking
// pauses are capped (no step waits more than maxGap) and the whole thing is squeezed into at most maxMs, with at least minStep per step.
export function schedule(log, { maxMs = 7000, minStep = 70, capGap = 20000, maxGap = 1200 } = {}) {
  const n = log.length; if (!n) return [];
  const step = Math.min(minStep, maxMs / (2 * n));
  const gaps = log.map((e, k) => Math.min(capGap, Math.max(0, e[0] - (k ? log[k - 1][0] : 0))));
  const total = gaps.reduce((a, b) => a + b, 0);
  const scale = total ? Math.min(0.25, (maxMs - step * n) / total) : 0;
  const out = []; let t = 0;
  for (const g of gaps) { t += step + Math.min(maxGap, g * scale); out.push(Math.round(t)); }
  return out;
}
// Summary for the caption: how many changes were fixes (a tile placed again) and hints.
export function replayStats(log) {
  const seen = new Set(); let redo = 0, hints = 0;
  for (const [, i, v, h] of log) { if (h) hints++; if (v && seen.has(i)) redo++; if (v) seen.add(i); }
  return { steps: log.length, redo, hints };
}
