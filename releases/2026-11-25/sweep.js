// Line sweep (2026-11-11 "Rainbow Lines"). When a move fills the last empty tile of a row, column or
// box and that line holds every color once, a rainbow shimmer runs along it with a rising chime.
// It checks only the rules (no repeats), never the hidden solution, so it gives nothing away.
// Pure helper, unit-tested in test/sweep.test.mjs.
import { units } from './logic.js';

const cache = {};
export function completedUnits(grid, modeKey, i) {
  if (!(grid[i] > 0)) return [];
  const all = cache[modeKey] || (cache[modeKey] = units(modeKey));
  return all.filter(u => u.cells.includes(i) && u.cells.every(c => grid[c] > 0) && new Set(u.cells.map(c => grid[c])).size === u.cells.length);
}
// Order the shimmer starting from the tile just placed and spreading outward along the line.
export function sweepOrder(unit, i) {
  const at = unit.cells.indexOf(i);
  return new Map(unit.cells.map((c, k) => [c, Math.abs(k - at)]));
}
