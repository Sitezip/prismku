// Pencil-mark helpers (pure, testable). Notes are bitmasks: bit v set = color v is a candidate.
// candidateMask: colors 1..size not already used by any peer of tile i.
export function candidateMask(grid, peerList, size, i) {
  let m = 0;
  for (let v = 1; v <= size; v++) m |= 1 << v;
  for (const p of peerList[i]) if (grid[p]) m &= ~(1 << grid[p]);
  return m;
}
// fillNotes: every empty tile gets its full candidate set; filled tiles get no notes.
// Returns a new notes array and how many tiles changed.
export function fillNotes(grid, notes, peerList, size) {
  let changed = 0;
  const out = grid.map((v, i) => {
    const m = v ? 0 : candidateMask(grid, peerList, size, i);
    if (m !== (notes?.[i] || 0)) changed++;
    return m;
  });
  return { notes: out, changed };
}
// singles: empty tiles whose notes hold exactly one color (a "naked single").
export function singles(grid, notes) {
  const out = [];
  grid.forEach((v, i) => { const m = notes?.[i] || 0; if (!v && m && !(m & (m - 1))) out.push(i); });
  return out;
}
