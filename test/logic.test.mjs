import assert from 'node:assert/strict';
import { MODES, MODE_KEYS, generate, peers, isSolved } from '../client/puzzle.js';
import { units, nextStep, explain } from '../client/logic.js';

const names = ['', 'Red', 'Blue', 'Yellow', 'Green', 'Cream', 'Orange', 'Purple', 'Pink', 'Teal'];
for (const mode of MODE_KEYS) {
  const m = MODES[mode], n = m.size, U = units(mode);
  assert.equal(U.length, m.box ? 3 * n : 2 * n, `${mode}: unit count`);
  for (const u of U) assert.equal(new Set(u.cells).size, n);
  let logicSolved = 0;
  for (const seed of [1, 7, 42, 99, 20261108]) {
    const { puzzle, solution } = generate(mode, seed);
    const g = puzzle.slice(); let steps = 0;
    for (;;) {
      const s = nextStep(g, mode);
      if (!s) break;
      assert.equal(g[s.i], 0, 'step targets an empty tile');
      assert.equal(s.v, solution[s.i], `${mode}#${seed}: step ${steps} must be the true color`);
      assert.ok(explain(s, names).includes(names[s.v]));
      if (s.kind === 'only-color') {
        assert.equal(new Set(s.why.map(w => g[w])).size, n - 1, 'one witness per other color');
        for (const w of s.why) assert.ok(peers(mode)[s.i].includes(w), 'witness is a peer');
      } else assert.ok(s.unit.cells.includes(s.i));
      g[s.i] = s.v; steps++;
    }
    if (isSolved(g, puzzle, mode)) logicSolved++;
  }
  // Generated puzzles should almost always fall to singles; require most of them.
  assert.ok(logicSolved >= 3, `${mode}: singles solved only ${logicSolved}/5`);
  console.log(`  ${mode}: ${logicSolved}/5 boards solved by explained hints alone`);
}
// Hand case (Easy): row 0 = R B Y _ → only Green fits tile 3.
const g = Array(16).fill(0); g[0] = 1; g[1] = 2; g[2] = 3;
const s = nextStep(g, 'easy');
assert.equal(s.i, 3); assert.equal(s.v, 4);
assert.equal(nextStep(generate('easy', 5).solution, 'easy'), null, 'full board has no step');
console.log('logic tests ok');
