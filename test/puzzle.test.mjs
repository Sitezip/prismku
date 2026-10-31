import { MODES, generate, countSolutions, isSolved, dailySeed, computeScore } from '../client/puzzle.js';
import assert from 'node:assert/strict';
let total = 0;
for (const key of Object.keys(MODES)) {
  const t0 = Date.now(); let clueSum = 0; const N = key === 'expert' ? 40 : 200;
  for (let s = 1; s <= N; s++) {
    const p = generate(key, s * 7919);
    assert.equal(countSolutions(p.puzzle, key, 2), 1, `${key} seed ${s} not unique`);
    assert.ok(isSolved(p.solution, p.puzzle, key));
    const again = generate(key, s * 7919);
    assert.deepEqual(again.puzzle, p.puzzle, 'determinism');
    clueSum += p.puzzle.filter(Boolean).length; total++;
  }
  console.log(`${key}: ${N} puzzles unique+deterministic, avg clues ${(clueSum / N).toFixed(1)}, ${((Date.now() - t0) / N).toFixed(1)} ms/puzzle`);
}
assert.notEqual(dailySeed('2026-10-30', 'easy'), dailySeed('2026-10-31', 'easy'));
assert.ok(computeScore('easy', 20000, 0, 0) > computeScore('easy', 60000, 1, 2));
console.log('all puzzle tests passed:', total);
