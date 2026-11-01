import { MODES } from '../client/puzzle.js';

// Anti-cheat clock: the server stamps when each player first sees a board and when they first report it solved.
// A submitted time can't beat that server-measured span (minus a little network slack), so pausing the client
// and solving on paper no longer helps. Times with no plausible server start are kept off leaderboards.
export const CLOCK_GRACE_MS = 3000;
export const PER_TILE_MS = 450;          // fastest plausible input per empty tile
export const minSolveMs = (modeKey, empty) => Math.max(MODES[modeKey].minMs, empty * PER_TILE_MS);
export function checkClock({ claimedMs, startedAt, finishedAt, now, floorMs }) {
  if (!startedAt) return { timeMs: claimedMs, ranked: 0, note: 'unverified' };
  const wall = (finishedAt || now) - startedAt;
  if (wall < floorMs) return { timeMs: claimedMs, ranked: 0, note: 'unverified', wall };
  if (claimedMs < wall - CLOCK_GRACE_MS) return { timeMs: wall - CLOCK_GRACE_MS, ranked: 1, note: 'clock', wall };
  return { timeMs: claimedMs, ranked: 1, note: null, wall };
}
