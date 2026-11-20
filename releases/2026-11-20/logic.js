// Explained hints (pure, testable): find the next tile that plain logic can prove, and say why.
// Works on the player's current grid, assuming every filled tile is correct (the hint fixes wrong tiles first).
import { MODES, peers } from './puzzle.js';
import { candidateMask } from './notes.js';

// units(mode): every row, column and (if the size has them) box, as lists of tile indexes.
export function units(modeKey) {
  const m = MODES[modeKey], n = m.size, out = [];
  for (let r = 0; r < n; r++) out.push({ kind: 'row', n: r + 1, cells: [...Array(n).keys()].map(c => r * n + c) });
  for (let c = 0; c < n; c++) out.push({ kind: 'column', n: c + 1, cells: [...Array(n).keys()].map(r => r * n + c) });
  if (m.box) {
    const [bh, bw] = m.box; let b = 0;
    for (let br = 0; br < n; br += bh) for (let bc = 0; bc < n; bc += bw) {
      const cells = []; for (let r = br; r < br + bh; r++) for (let c = bc; c < bc + bw; c++) cells.push(r * n + c);
      out.push({ kind: 'box', n: ++b, cells });
    }
  }
  return out;
}

const bits = m => { const o = []; for (let v = 1; m >> v; v++) if (m & (1 << v)) o.push(v); return o; };

// nextStep(grid, mode): the easiest provable placement, or null.
//  { kind: 'only-color', i, v, why: [tiles holding each other color] }  (naked single: every other color is used by a peer)
//  { kind: 'only-spot', i, v, unit: {kind,n,cells} }                    (hidden single: v fits nowhere else in that row/column/box)
export function nextStep(grid, modeKey) {
  const m = MODES[modeKey], n = m.size, P = peers(modeKey);
  const cand = grid.map((v, i) => v ? 0 : candidateMask(grid, P, n, i));
  // 1) Naked singles: show one witness tile for each excluded color.
  for (let i = 0; i < grid.length; i++) {
    const c = cand[i];
    if (grid[i] || !c || (c & (c - 1))) continue;
    const v = bits(c)[0], why = [];
    for (let u = 1; u <= n; u++) if (u !== v) { const w = P[i].find(p => grid[p] === u); if (w !== undefined) why.push(w); }
    return { kind: 'only-color', i, v, why };
  }
  // 2) Hidden singles: boxes first (easiest to see), then rows, then columns.
  const order = { box: 0, row: 1, column: 2 };
  for (const unit of units(modeKey).sort((a, b) => order[a.kind] - order[b.kind])) {
    const placed = new Set(unit.cells.map(i => grid[i]).filter(Boolean));
    for (let v = 1; v <= n; v++) {
      if (placed.has(v)) continue;
      const spots = unit.cells.filter(i => !grid[i] && (cand[i] & (1 << v)));
      if (spots.length === 1) return { kind: 'only-spot', i: spots[0], v, unit };
    }
  }
  return null;
}

// explain(step, colorNames): one short sentence for the toast.
export function explain(step, names, hasBox = true) {
  if (!step) return '';
  const c = names[step.v];
  if (step.kind === 'only-color') return `${c} is the only color that fits here: the glowing tiles use every other color in its row${hasBox ? ', column and box' : ' and column'}.`;
  return `${c} can only go here in ${step.unit.kind} ${step.unit.n}: every other open tile there already sees ${c}.`;
}
