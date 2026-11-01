// Server clock rules (anti "pause, solve on paper, enter fast" exploit). node test/clock.test.mjs
import assert from 'node:assert/strict';
import { checkClock, minSolveMs, CLOCK_GRACE_MS } from '../src/clock.js';
const floorMs = minSolveMs('easy', 9);
assert.equal(floorMs, 4050, 'easy floor = 9 tiles × 450ms');
assert.equal(minSolveMs('expert', 51), 30000, 'expert keeps its 30s minimum');
const t0 = 1_000_000;
// No server start → unranked.
assert.deepEqual(checkClock({ claimedMs: 5000, startedAt: null, finishedAt: null, now: t0, floorMs }), { timeMs: 5000, ranked: 0, note: 'unverified' });
// Start stamped only seconds before the solve (start sent late / paper solve with a fresh identity) → unranked.
assert.equal(checkClock({ claimedMs: 4100, startedAt: t0, finishedAt: t0 + 2000, now: t0 + 2500, floorMs }).ranked, 0);
// Exploit: board first shown at t0, solved 5 minutes later, client claims 3s → server time wins.
const ex = checkClock({ claimedMs: 4100, startedAt: t0, finishedAt: t0 + 300000, now: t0 + 301000, floorMs });
assert.equal(ex.ranked, 1); assert.equal(ex.note, 'clock'); assert.equal(ex.timeMs, 300000 - CLOCK_GRACE_MS);
// Honest solve: client time ≈ server span → unchanged.
assert.deepEqual(checkClock({ claimedMs: 14800, startedAt: t0, finishedAt: t0 + 15500, now: t0 + 60000, floorMs }), { timeMs: 14800, ranked: 1, note: null, wall: 15500 });
// Late submit (nickname typed after the solve) is timed to the finish stamp, not to the submit.
assert.equal(checkClock({ claimedMs: 20000, startedAt: t0, finishedAt: t0 + 21000, now: t0 + 900000, floorMs }).note, null);
// No finish stamp → falls back to submit time.
assert.equal(checkClock({ claimedMs: 20000, startedAt: t0, finishedAt: null, now: t0 + 90000, floorMs }).timeMs, 87000);
console.log('clock tests passed');
