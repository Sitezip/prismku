// Color spotlight (2026-11-10 "Spotlight"). When a color is in focus (the armed paint color, or the
// color on the selected tile), show every tile already holding it and dim the empty tiles it can't
// go in (a peer already has it). What's left bright is where that color can still go.
// Pure helper, unit-tested in test/spotlight.test.mjs.
export function spotlight(grid, peerList, v) {
  const same = new Set(), blocked = new Set(), open = new Set();
  if (!(v > 0)) return { same, blocked, open };
  for (let i = 0; i < grid.length; i++) if (grid[i] === v) same.add(i);
  for (let i = 0; i < grid.length; i++) {
    if (grid[i]) continue;
    if (peerList[i].some(p => grid[p] === v)) blocked.add(i); else open.add(i);
  }
  return { same, blocked, open };
}
// Which color is in focus: the armed brush wins, else the selected tile's color, else none.
export function focusColor(brush, grid, sel) {
  if (brush > 0) return brush;
  return sel >= 0 && grid[sel] > 0 ? grid[sel] : 0;
}
