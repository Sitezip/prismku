// Pace vs. your personal best (2026-11-09 "Beat Your Best"). Pure helpers, unit-tested in test/pace.test.mjs.
// state: 'none' (no best yet) | 'ahead' (comfortably under) | 'close' (last 15% or 15s of your best) | 'behind' (past it)
export function paceState(elapsedMs, bestMs) {
  if (!(bestMs > 0)) return 'none';
  if (elapsedMs > bestMs) return 'behind';
  const margin = Math.min(15000, bestMs * 0.15);
  return bestMs - elapsedMs <= margin ? 'close' : 'ahead';
}
// How much faster (ms) a finished time beat the previous best, or 0 if it didn't.
export function beatBy(elapsedMs, prevBestMs) {
  return prevBestMs > 0 && elapsedMs < prevBestMs ? prevBestMs - elapsedMs : 0;
}
