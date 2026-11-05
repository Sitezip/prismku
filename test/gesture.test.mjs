// Tickets #6 and #7: paint mode must let go, and a solved board must not restart.
import assert from 'node:assert/strict';
import { paletteTap, canRestart, clearedWhileSolved } from '../client/gesture.js';

const tap = (over) => paletteTap({ done: false, brush: 0, sel: -1, v: 1, given: false, notesOn: false, cellValue: 0, ...over });

// No tile selected: the first color tap arms paint.
assert.deepEqual(tap({ v: 1 }), { type: 'brush', brush: 1 });
// Ticket #7: after a tile is painted it stays selected, and tapping the armed color must turn paint OFF
// rather than erase that tile (the old handler did place(sel, 0)).
assert.deepEqual(tap({ brush: 1, sel: 3, v: 1, cellValue: 1 }), { type: 'brush', brush: 0 });
// A different color switches the brush and does not rewrite the selected tile.
assert.deepEqual(tap({ brush: 1, sel: 3, v: 2, cellValue: 1 }), { type: 'brush', brush: 2 });
// Cell first, then a color, still places — and the same color erases — without arming paint.
assert.deepEqual(tap({ sel: 3, v: 2 }), { type: 'place', v: 2 });
assert.deepEqual(tap({ sel: 3, v: 2, cellValue: 2 }), { type: 'place', v: 0 });
// Notes on a selected empty tile still toggle a pencil dot when paint is off.
assert.deepEqual(tap({ sel: 3, v: 2, notesOn: true }), { type: 'note', v: 2 });
// A filled tile is not a note target.
assert.deepEqual(tap({ sel: 3, v: 2, notesOn: true, cellValue: 4 }), { type: 'place', v: 2 });
// Tapping a color while a given tile is selected arms paint instead of overwriting the clue.
assert.deepEqual(tap({ sel: 0, v: 1, given: true, cellValue: 3 }), { type: 'brush', brush: 1 });
// A finished board ignores the palette.
assert.deepEqual(tap({ done: true, sel: 3, v: 1 }), { type: 'noop' });

assert.equal(canRestart(false), true);
assert.equal(canRestart(true), false);
assert.equal(clearedWhileSolved(true, false), true);
assert.equal(clearedWhileSolved(true, true), false);
assert.equal(clearedWhileSolved(false, false), false);

console.log('gesture tests passed');
