// Overdrive scoring (ticket #11): no flat cap, old scores unchanged below the old ceiling.
import assert from 'node:assert/strict';
import { MODES, computeScore, scoreBreakdown, OVERDRIVE_AT } from '../client/puzzle.js';
import { minSolveMs } from '../src/clock.js';

const old = (k, ms, h = 0, x = 0) => { const m = MODES[k]; const adj = ms / 1000 + h * 15 + x * 3; return Math.max(10, Math.round(m.base * Math.min(2.5, m.par / Math.max(1, adj)))); };
for (const [k, m] of Object.entries(MODES)) {
  // Identical to the old formula up to the old ceiling
  for (const s of [Math.max(m.par / 2.4, 10), m.par / 2, m.par, m.par * 3, m.par * 40]) for (const h of [0, 1]) for (const x of [0, 2])
    if (m.par / (s + h * 15 + x * 3) <= OVERDRIVE_AT) assert.equal(computeScore(k, s * 1000, h, x), old(k, s * 1000, h, x), `${k} ${s}s unchanged`);
  const ceiling = Math.round(m.base * OVERDRIVE_AT);
  // Continuous at the knee, then strictly rising as time drops: no plateau
  assert.equal(computeScore(k, (m.par / OVERDRIVE_AT) * 1000, 0, 0), ceiling, `${k} knee`);
  let prev = ceiling;
  for (let s = m.par / OVERDRIVE_AT - 1; s * 1000 >= minSolveMs(k, m.size * m.size - m.clues); s -= 1) {
    const b = scoreBreakdown(k, s * 1000);
    assert.ok(b.score > prev, `${k} ${s}s should beat ${prev} (got ${b.score})`);
    assert.equal(b.overdrive, b.score - ceiling); assert.equal(b.ceiling, ceiling);
    prev = b.score;
  }
  // Below the knee: no overdrive
  assert.equal(scoreBreakdown(k, m.par * 1000).overdrive, 0);
  // Hints/clashes still cost in Overdrive
  const fast = (m.par / 5) * 1000;
  assert.ok(computeScore(k, fast, 0, 0) > computeScore(k, fast, 0, 1));
  assert.ok(computeScore(k, fast, 0, 1) > computeScore(k, fast, 1, 0));
  // Fastest server-accepted solve stays sane (well under 2× the old ceiling)
  const empty = m.size * m.size - m.clues;
  const top = computeScore(k, minSolveMs(k, empty), 0, 0);
  assert.ok(top > ceiling && top < ceiling * 2, `${k} top ${top}`);
  // Instant (impossible) times can't inflate the number: same as the floor
  assert.equal(computeScore(k, 1, 0, 0), top);
  console.log(`${k}: ceiling was ${ceiling}, fastest accepted solve now ${top}`);
}
// The ticket's case: an Expert 3:03 solve used to be capped at 10,000
assert.equal(old('expert', 183559), 10000);
assert.ok(computeScore('expert', 183559) > 10000);
assert.ok(computeScore('expert', 150000) > computeScore('expert', 183559));
console.log('score tests passed');
