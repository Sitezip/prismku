// Palette and solved-board gestures. Pure so phone paint-mode (ticket #7)
// and restart-after-solve (ticket #6) stay covered by `npm test`.

/**
 * What a tap on color `v` should do.
 * `brush` is the armed paint color, or 0. `sel` is the selected cell, or -1.
 * Once paint is on, the palette only changes the brush: tapping the armed
 * color turns it off even if a tile is selected. Phones have no Escape key,
 * and that selected tile used to swallow the off tap (ticket #7) — the border
 * stayed thick and every later touch kept placing the color.
 */
export function paletteTap({ done, brush, sel, v, given, notesOn, cellValue }) {
  if (done) return { type: 'noop' };
  if (brush === v) return { type: 'brush', brush: 0 };
  if (brush) return { type: 'brush', brush: v };
  if (sel >= 0 && !given) {
    if (notesOn && !cellValue) return { type: 'note', v };
    return { type: 'place', v: cellValue === v ? 0 : v };
  }
  return { type: 'brush', brush: v };
}

/** Restart stays available only while the puzzle is unsolved (ticket #6). */
export function canRestart(done) {
  return !done;
}

/**
 * Restart on a solved free-play board used to clear the tiles but leave `done`
 * set, so the board looked empty and refused moves. That save should load playable.
 */
export function clearedWhileSolved(done, gridSolved) {
  return !!done && !gridSolved;
}

/**
 * Ticket #10: in Free play, Restart starts the clock over. A restarted board has
 * already been seen, so that run is practice: it never goes to the leaderboard
 * or local bests (otherwise you could study the board, restart and race it).
 * Today's daily keeps one continuous clock.
 */
export function restartResetsClock(play) {
  return play !== 'daily';
}
