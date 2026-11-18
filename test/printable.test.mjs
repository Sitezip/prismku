import assert from 'node:assert/strict';
import { sheetOptions, sheetQuery, buildSheet, randomSheetSeed } from '../client/printable.js';
import { MODES, generate, countSolutions } from '../client/puzzle.js';
import { decodeChallenge } from '../client/challenge.js';
assert.deepEqual(sheetOptions(''), { mode: 'easy', count: 4, style: 'color', answers: true, seed: null });
assert.deepEqual(sheetOptions('?size=expert&n=6&style=crayon&answers=0&seed=AB-c9'), { mode: 'expert', count: 6, style: 'crayon', answers: false, seed: 'abc9' });
assert.deepEqual(sheetOptions('?size=huge&n=99&style=<x>&seed=<script>alert(1)</script>'), { mode: 'easy', count: 4, style: 'color', answers: true, seed: 'scriptalert1' });
assert.equal(sheetOptions('?seed=' + 'z'.repeat(40)).seed.length, 12);
const o = { mode: 'hard', count: 2, style: 'crayon', answers: false, seed: 'q1w2e3' };
assert.deepEqual(sheetOptions(sheetQuery(o)), o);
for (let i = 0; i < 50; i++) assert.match(randomSheetSeed(), /^[0-9a-z]{6}$/);
assert.equal(randomSheetSeed(() => 0), '000000');
for (const mode of Object.keys(MODES)) {
  const a = buildSheet({ mode, count: mode === 'expert' ? 2 : 6, seed: 'test1' }), b = buildSheet({ mode, count: a.length, seed: 'test1' });
  assert.deepEqual(a, b, 'deterministic');
  assert.notDeepEqual(buildSheet({ mode, count: 1, seed: 'other' })[0].puzzle, a[0].puzzle);
  assert.equal(new Set(a.map(x => x.seed)).size, a.length, 'distinct boards');
  for (const x of a) {
    const n = MODES[mode].size;
    assert.equal(x.puzzle.length, n * n); assert.equal(x.size, n);
    assert.ok(x.puzzle.every((v, i) => !v || v === x.solution[i]), 'givens match answer');
    assert.equal(countSolutions(x.puzzle.slice(), MODES[mode], 2), 1, 'unique');
    const d = decodeChallenge(x.code); assert.equal(d.mode, mode); assert.equal(d.seed, x.seed);
    assert.deepEqual(generate(mode, d.seed).puzzle, x.puzzle, 'online link plays the printed board');
  }
}
console.log('printable ok');
