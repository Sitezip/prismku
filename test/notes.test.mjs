import assert from 'node:assert/strict';
import { MODES, MODE_KEYS, generate, peers } from '../client/puzzle.js';
import { candidateMask, fillNotes, singles } from '../client/notes.js';

for (const mode of MODE_KEYS) {
  const size = MODES[mode].size, P = peers(mode);
  for (const seed of [1, 42, 20261107]) {
    const { puzzle, solution } = generate(mode, seed);
    const { notes, changed } = fillNotes(puzzle, null, P, size);
    assert.equal(notes.length, puzzle.length);
    puzzle.forEach((v, i) => {
      if (v) { assert.equal(notes[i], 0, 'given tiles get no notes'); return; }
      assert.ok(notes[i] & (1 << solution[i]), `${mode}#${seed} tile ${i}: true color must be a candidate`);
      for (const p of P[i]) if (puzzle[p]) assert.equal(notes[i] & (1 << puzzle[p]), 0, 'peer color excluded');
      assert.equal(notes[i] & 1, 0, 'bit 0 unused');
      assert.ok(notes[i] < (1 << (size + 1)), 'no colors beyond size');
    });
    assert.equal(changed, puzzle.filter(v => !v).length);
    // Idempotent: refilling changes nothing.
    assert.equal(fillNotes(puzzle, notes, P, size).changed, 0);
    // Every naked single is the true color.
    for (const i of singles(puzzle, notes)) assert.equal(notes[i], 1 << solution[i]);
  }
}
// Tiny hand-checked case on Easy 4×4.
const P = peers('easy'), g = Array(16).fill(0);
g[1] = 1; g[4] = 2; g[5] = 3;           // row 0 has 1; col 0 has 2; box 0 has 1,2,3
assert.equal(candidateMask(g, P, 4, 0), 1 << 4);
assert.deepEqual(singles(g, fillNotes(g, null, P, 4).notes).includes(0), true);
console.log('notes tests ok');
