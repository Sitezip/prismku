import assert from 'node:assert/strict';
import { completedUnits, sweepOrder } from '../client/sweep.js';
import { generate, MODES } from '../client/puzzle.js';

// 4x4: fill row 1 with 1..4 -> the row completes; column/box don't.
const g = Array(16).fill(0); g[0] = 1; g[1] = 2; g[2] = 3; g[3] = 4;
let u = completedUnits(g, 'easy', 3);
assert.deepEqual(u.map(x => x.kind + x.n), ['row1']);
// A repeat in a full line doesn't count.
const r = [...g]; r[3] = 1; assert.equal(completedUnits(r, 'easy', 3).length, 0);
// Empty target tile -> nothing.
assert.equal(completedUnits(g, 'easy', 5).length, 0);
// Box 1 (0,1,4,5) completes; row 2 and column 2 are still open.
const b = [...g]; b[4] = 3; b[5] = 4;
assert.deepEqual(completedUnits(b, 'easy', 5).map(x => x.kind + x.n), ['box1']);
// Solved board: every tile completes its row, column and (if any) box.
for (const key of Object.keys(MODES)) {
  const pz = generate(key, 777);
  const want = MODES[key].box ? 3 : 2;
  for (const i of [0, pz.solution.length - 1]) assert.equal(completedUnits(pz.solution, key, i).length, want, key);
}
const ord = sweepOrder({ cells: [0, 1, 2, 3] }, 2);
assert.deepEqual([...ord.values()], [2, 1, 0, 1]);
console.log('sweep tests ok');
