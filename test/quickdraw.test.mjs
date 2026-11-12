import assert from 'node:assert/strict';
import { QD, makeRound, answerOf, totalMs, fmtSec, checkReaction, shareText } from '../client/quickdraw.js';
for (let i = 0; i < 500; i++) {
  const r = makeRound();
  assert.equal(r.board.filter(v => v === 0).length, 1);
  assert.deepEqual([...r.board.filter(Boolean), r.answer].sort(), [1, 2, 3, 4]);
  assert.equal(answerOf(r.board), r.answer);
  assert.ok(r.delayMs >= QD.minDelayMs && r.delayMs <= QD.maxDelayMs);
}
assert.equal(answerOf([1, 2, 3, 4]), null);
assert.equal(answerOf([0, 0, 3, 4]), null);
assert.equal(fmtSec(287.4), '0.287 s');
assert.equal(fmtSec(1), '0.001 s');
assert.equal(totalMs(250.6, 1), 1251);
// Server check
assert.deepEqual(checkReaction({ claimedMs: 300, wallMs: 420, wrong: 0 }), { ok: true, ms: 300, note: null });
assert.equal(checkReaction({ claimedMs: 90, wallMs: 400, wrong: 0 }).note, 'too fast');
assert.equal(checkReaction({ claimedMs: 150, wallMs: 60, wrong: 0 }).ok, false);
assert.equal(checkReaction({ claimedMs: 900, wallMs: 400, wrong: 0 }).note, 'clock mismatch');
assert.deepEqual(checkReaction({ claimedMs: 200, wallMs: 3000, wrong: 0 }), { ok: true, ms: 1800, note: 'clock' });
assert.equal(checkReaction({ claimedMs: 300, wallMs: 400, wrong: 1 }).ms, 1300);
assert.equal(checkReaction({ claimedMs: 300, wallMs: 400, wrong: 2 }).ok, false);
assert.equal(checkReaction({ claimedMs: 300, wallMs: 70000, wrong: 0 }).note, 'too slow');
const t = shareText({ ms: 287, best: 251, board: [1, 0, 3, 4], answer: 2 });
assert.ok(t.includes('0.287 s') && t.includes('PB 0.251 s') && t.includes('🟥🟦') && t.includes('/quick-draw/'));
assert.ok(shareText({ ms: 251, best: 251 }).includes('new PB'));
console.log('quickdraw ok');
