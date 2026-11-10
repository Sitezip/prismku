import assert from 'node:assert/strict';
import { spotlight, focusColor } from '../client/spotlight.js';
import { peers, generate, MODES } from '../client/puzzle.js';

// 4x4 with 2x2 boxes: color 1 at index 0 blocks its row, column and box.
const P = peers('easy');
const g = Array(16).fill(0); g[0] = 1; g[10] = 2;
const s = spotlight(g, P, 1);
assert.deepEqual([...s.same], [0]);
for (const i of [1, 2, 3, 4, 8, 12, 5]) assert.ok(s.blocked.has(i), 'blocked ' + i);
for (const i of [6, 7, 9, 11, 13, 14, 15]) assert.ok(s.open.has(i), 'open ' + i);
assert.ok(!s.open.has(10) && !s.blocked.has(10), 'filled tiles are neither open nor blocked');
assert.equal(spotlight(g, P, 0).same.size, 0);

// Every open tile for a color on a real puzzle includes the solution's spots for it.
for (const key of Object.keys(MODES)) {
  const pz = generate(key, 12345);
  const grid = [...pz.puzzle], PP = peers(key);
  for (let v = 1; v <= MODES[key].size; v++) {
    const r = spotlight(grid, PP, v);
    grid.forEach((x, i) => { if (!x && pz.solution[i] === v) assert.ok(r.open.has(i), `${key} v${v} i${i}`); });
  }
}

assert.equal(focusColor(3, g, 0), 3);
assert.equal(focusColor(0, g, 0), 1);
assert.equal(focusColor(0, g, 1), 0);
assert.equal(focusColor(0, g, -1), 0);
console.log('spotlight tests ok');
