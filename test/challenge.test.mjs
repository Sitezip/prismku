import assert from 'node:assert/strict';
import { encodeChallenge, decodeChallenge, challengeFromLocation, challengeUrl, challengeVerdict, challengeTitle, marginText, rememberSeed, seenSeed } from '../client/challenge.js';
for (const mode of ['easy', 'medium', 'hard', 'expert']) for (const seed of [0, 1, 123456789, 0xffffffff]) for (const ms of [null, 1, 83456, 3599999]) {
  const code = encodeChallenge({ mode, seed, ms }); assert.ok(code, `${mode} ${seed} ${ms}`);
  assert.deepEqual(decodeChallenge(code), { mode, seed, ms: ms || null });
}
assert.equal(encodeChallenge({ mode: 'daily', seed: 1 }), null);
assert.equal(encodeChallenge({ mode: 'easy', seed: -1 }), null);
assert.equal(encodeChallenge({ mode: 'easy', seed: 2 ** 32 }), null);
assert.equal(encodeChallenge({ mode: 'easy', seed: 1.5 }), null);
assert.equal(encodeChallenge({ mode: 'easy', seed: 5, ms: 0 }), 'e5');
assert.equal(encodeChallenge({ mode: 'easy', seed: 5, ms: 1e12 }), 'e5');
for (const bad of ['', 'q12', 'e', 'e12-', 'e12-zzzzzzz', 'ezzzzzzzz', 'e<script>', 'zzzzzzz1', 'e1 2', null, undefined, 'e1-0'.repeat(9)]) assert.equal(decodeChallenge(bad), null, String(bad));
assert.equal(decodeChallenge('ezzzzzz').seed, parseInt('zzzzzz', 36));
assert.equal(decodeChallenge('ezzzzzzz'), null); // > 2^32-1
assert.equal(decodeChallenge('e1-0').ms, null);
assert.deepEqual(decodeChallenge('H2S'), { mode: 'hard', seed: parseInt('2s', 36), ms: null });
assert.deepEqual(challengeFromLocation('/c/h2s-1s0', ''), { mode: 'hard', seed: 100, ms: parseInt('1s0', 36) });
assert.deepEqual(challengeFromLocation('/c/h2s/', ''), { mode: 'hard', seed: 100, ms: null });
assert.deepEqual(challengeFromLocation('/', '?c=x10'), { mode: 'expert', seed: 36, ms: null });
assert.equal(challengeFromLocation('/', ''), null);
assert.equal(challengeFromLocation('/c/bad!', ''), null);
assert.equal(challengeFromLocation('/v/2026-11-13/', '?ref=itch'), null);
assert.equal(challengeUrl('https://prismku.com', { mode: 'easy', seed: 35, ms: 61000 }), 'https://prismku.com/c/ez-1b2g');
assert.equal(challengeUrl('https://prismku.com/', { mode: 'nope', seed: 1 }), null);
assert.deepEqual(challengeVerdict(50000, 61000), { won: true, tie: false, diff: 11000 });
assert.deepEqual(challengeVerdict(61500, 61000), { won: false, tie: false, diff: 500 });
assert.deepEqual(challengeVerdict(60950, 61000), { won: false, tie: true, diff: 50 });
assert.equal(marginText(2449), '2.4s'); assert.equal(marginText(59999), '59.9s'); assert.equal(marginText(83000), '1:23');
assert.deepEqual(challengeVerdict(70000, 61000), { won: false, tie: false, diff: 9000 });
assert.equal(challengeVerdict(1000, null), null);
assert.equal(challengeTitle({ mode: 'hard', seed: 1, ms: 83000 }), 'Can you beat 1:23 on this Prismku Hard 6×6?');
assert.equal(challengeTitle({ mode: 'easy', seed: 1, ms: null }), 'Try this Prismku Easy 4×4 board');
let l = rememberSeed(null, 'easy', 1); l = rememberSeed(l, 'hard', 2); l = rememberSeed(l, 'easy', 1);
assert.deepEqual(l, ['hard:2', 'easy:1']); assert.ok(seenSeed(l, 'easy', 1)); assert.ok(!seenSeed(l, 'easy', 2)); assert.ok(!seenSeed(undefined, 'easy', 1));
let big = []; for (let i = 0; i < 150; i++) big = rememberSeed(big, 'easy', i); assert.equal(big.length, 100); assert.ok(!seenSeed(big, 'easy', 0)); assert.ok(seenSeed(big, 'easy', 149));
console.log('challenge tests ok');
