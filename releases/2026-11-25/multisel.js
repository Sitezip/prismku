// Multi-select pencil marks (2026-11-25, ticket #13: "multiple select"). Pure, so `npm test` covers it.
// Select several tiles (drag across them with Notes on, or Ctrl/Shift/⌘-click), then one color tap
// pencils that color into every selected empty tile — or takes it out of all of them if they all had it.

/** Tiles in `idxs` that can hold notes: empty and not given. Sorted, unique. */
export function noteTargets(grid, puzzle, idxs) {
  return [...new Set(idxs)].filter(i => i >= 0 && i < grid.length && !puzzle[i] && !grid[i]).sort((a, b) => a - b);
}

/**
 * Toggle color `v` across many tiles at once. If every target already has the dot, remove it from all;
 * otherwise add it to all (so a mixed selection fills in first, like single-tile toggles feel).
 * Returns { notes, action: 'add'|'remove'|'none', count } without mutating the input.
 */
export function toggleNoteMany(grid, puzzle, notes, idxs, v) {
  const t = noteTargets(grid, puzzle, idxs), bit = 1 << v, out = notes.slice();
  if (!t.length || !(v >= 1)) return { notes: out, action: 'none', count: 0 };
  const all = t.every(i => (out[i] || 0) & bit);
  for (const i of t) out[i] = all ? (out[i] || 0) & ~bit : (out[i] || 0) | bit;
  return { notes: out, action: all ? 'remove' : 'add', count: t.length };
}

/** Wipe every note in the selected tiles. Returns { notes, count } (count = tiles that had notes). */
export function clearNotesMany(grid, puzzle, notes, idxs) {
  const out = notes.slice(); let count = 0;
  for (const i of noteTargets(grid, puzzle, idxs)) if (out[i]) { out[i] = 0; count++; }
  return { notes: out, count };
}

/** Ctrl/Shift-click: add tile `i` to the selection (seeded with the current single tile), or drop it if present. */
export function toggleInSelection(selection, sel, i) {
  const s = new Set(selection);
  if (!s.size && sel >= 0) s.add(sel);
  if (s.has(i) && s.size > 1) s.delete(i); else s.add(i);
  return s;
}

/** Drag across the board: every tile the pointer passes over joins the selection (in order, no repeats). */
export function extendDrag(selection, i) {
  const s = new Set(selection); s.add(i); return s;
}
