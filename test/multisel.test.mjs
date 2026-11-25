import assert from 'node:assert/strict';
import { noteTargets, toggleNoteMany, clearNotesMany, toggleInSelection, extendDrag } from '../client/multisel.js';
import { generate } from '../client/puzzle.js';

// 4x4 toy: tile 0 given, tile 1 filled by player, tiles 2..15 empty
const puzzle = Array(16).fill(0); puzzle[0] = 1;
const grid = puzzle.slice(); grid[1] = 2;
let notes = Array(16).fill(0);
assert.deepEqual(noteTargets(grid, puzzle, [5, 0, 1, 3, 3, 99, -1]), [3, 5], 'skips given, filled, out-of-range, dupes');

// mixed selection: add to all
notes[3] = 1 << 4;
let r = toggleNoteMany(grid, puzzle, notes, [0, 1, 3, 5, 7], 4);
assert.equal(r.action, 'add'); assert.equal(r.count, 3);
assert.ok([3, 5, 7].every(i => r.notes[i] & (1 << 4)));
assert.equal(r.notes[0], 0); assert.equal(r.notes[1], 0, 'given/filled tiles get no notes');
assert.equal(notes[5], 0, 'input not mutated');
// all have it: remove from all, other colors untouched
r.notes[5] |= 1 << 2;
const r2 = toggleNoteMany(grid, puzzle, r.notes, [3, 5, 7], 4);
assert.equal(r2.action, 'remove');
assert.ok([3, 5, 7].every(i => !(r2.notes[i] & (1 << 4))));
assert.equal(r2.notes[5], 1 << 2, 'other dots stay');
// nothing to do
assert.equal(toggleNoteMany(grid, puzzle, notes, [0, 1], 3).action, 'none');
assert.equal(toggleNoteMany(grid, puzzle, notes, [4], 0).action, 'none', 'color 0 is not a note');

// clear many
const c = clearNotesMany(grid, puzzle, r2.notes, [3, 5, 6]);
assert.equal(c.count, 1); assert.equal(c.notes[5], 0);

// selection helpers
let s = toggleInSelection(new Set(), 4, 9);
assert.deepEqual([...s].sort((a, b) => a - b), [4, 9], 'seeds with the current tile');
s = toggleInSelection(s, 9, 4); assert.deepEqual([...s], [9], 'ctrl-click again drops a tile');
s = toggleInSelection(s, 9, 9); assert.deepEqual([...s], [9], 'never drops the last tile');
s = extendDrag(extendDrag(extendDrag(new Set(), 1), 2), 1); assert.deepEqual([...s], [1, 2]);

// real boards: selecting every tile and toggling a color touches exactly the empty tiles
for (const mode of ['easy', 'medium', 'hard', 'expert']) {
  const p = generate(mode, 7), all = p.puzzle.map((_, i) => i);
  const t = toggleNoteMany(p.puzzle, p.puzzle, p.puzzle.map(() => 0), all, 1);
  assert.equal(t.count, p.puzzle.filter(v => !v).length);
  assert.ok(t.notes.every((m, i) => p.puzzle[i] ? m === 0 : m === 2));
}
console.log('multisel tests ok');
