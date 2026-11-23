import assert from 'node:assert/strict';
import { generate } from '../client/puzzle.js';
import { logMove, boardAt, replayable, schedule, replayStats, LOG_CAP } from '../client/replay.js';
for (const mode of ['easy', 'medium', 'hard', 'expert']) {
  const p = generate(mode, 12345);
  const empties = p.puzzle.map((v, i) => v ? -1 : i).filter(i => i >= 0);
  const log = []; let t = 0;
  // a wrong tile, then erase it, then the real solve; one "hint"
  const e0 = empties[0], wrong = p.solution[e0] % (mode === 'expert' ? 9 : Math.sqrt(p.puzzle.length)) + 1;
  logMove(log, t += 900, e0, wrong); logMove(log, t += 400, e0, 0);
  empties.forEach((i, k) => logMove(log, t += 1500 + (k === 2 ? 120000 : 0), i, p.solution[i], k === 1));
  assert.ok(replayable(p.puzzle, p.solution, log), mode + ' replayable');
  assert.deepEqual(boardAt(p.puzzle, log, 0), p.puzzle);
  assert.equal(boardAt(p.puzzle, log, 1)[e0], wrong);
  assert.equal(boardAt(p.puzzle, log, 2)[e0], 0);
  assert.ok(!replayable(p.puzzle, p.solution, log.slice(0, -1)), 'incomplete log is not replayable');
  assert.ok(!replayable(p.puzzle, p.solution, undefined) && !replayable(p.puzzle, p.solution, []), 'missing log');
  assert.ok(!replayable(p.puzzle, p.solution, [[0, 999, 1, 0]]), 'bad tile index');
  const s = schedule(log);
  assert.equal(s.length, log.length);
  for (let k = 1; k < s.length; k++) assert.ok(s[k] > s[k - 1], 'strictly increasing');
  assert.ok(s.at(-1) <= 7000 + 1, mode + ' fits in 7s: ' + s.at(-1));
  assert.ok(s.at(-1) >= 1000, mode + ' not instant: ' + s.at(-1));
  // the 2-minute pause is capped: its gap is not wildly longer than the others
  const gaps = s.map((x, k) => x - (k ? s[k - 1] : 0));
  assert.ok(Math.max(...gaps) < 2500, 'long pause capped ' + Math.max(...gaps));
  const st = replayStats(log);
  assert.equal(st.steps, log.length); assert.equal(st.hints, 1); assert.equal(st.redo, 1);
}
// the cap keeps the newest entries, and a capped log is never replayable
const big = []; for (let k = 0; k < LOG_CAP + 50; k++) logMove(big, k, 0, 1);
assert.equal(big.length, LOG_CAP); assert.equal(big[0][0], 50);
const p = generate('easy', 1); assert.ok(!replayable(p.puzzle, p.solution, big));
assert.deepEqual(schedule([]), []);
// instant solve (all times 0) still plays step by step
const z = schedule([[0, 1, 1, 0], [0, 2, 2, 0]]); assert.ok(z[0] > 0 && z[1] > z[0]);
console.log('replay tests ok');
