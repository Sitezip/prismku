// BASE=http://127.0.0.1:8787 node test/quickdraw-api.test.mjs
import assert from 'node:assert/strict';
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const j = async (p, body) => { const r = await fetch(BASE + '/api/' + p, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}); return { status: r.status, ...(await r.json()) }; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const id = crypto.randomUUID(), secret = 'qdsecret_' + Math.random().toString(36).slice(2, 14) + 'abcdefgh';
const nick = 'QD' + Math.floor(Math.random() * 9999);
assert.ok((await j('player', { id, secret, nickname: nick })).ok);
const missing = (b) => [1, 2, 3, 4].find(c => !b.includes(c));
// False start: reveal before the wait is over.
let s = await j('qd/start', { playerId: id }); assert.ok(s.ok && s.delayMs >= 1500 && !s.board, JSON.stringify(s));
assert.equal((await j('qd/reveal', { playerId: id, roundId: s.roundId })).status, 425, 'early reveal is a false start');
assert.equal((await j('qd/reveal', { playerId: id, roundId: s.roundId })).status, 409, 'false-start round is dead');
// Too fast: instant answer.
s = await j('qd/start', { playerId: id }); await sleep(s.delayMs);
let r = await j('qd/reveal', { playerId: id, roundId: s.roundId }); assert.ok(r.ok && r.board.length === 4);
assert.equal((await j('qd/finish', { playerId: id, roundId: s.roundId, secret, color: missing(r.board), ms: 40, wrong: 0 })).status, 400, 'under 100 ms rejected');
// Wrong color fails.
s = await j('qd/start', { playerId: id }); await sleep(s.delayMs);
r = await j('qd/reveal', { playerId: id, roundId: s.roundId }); await sleep(300);
assert.equal((await j('qd/finish', { playerId: id, roundId: s.roundId, secret, color: missing(r.board) % 4 + 1, ms: 280, wrong: 0 })).status, 400, 'wrong color');
// Claim longer than the server saw: rejected.
s = await j('qd/start', { playerId: id }); await sleep(s.delayMs);
r = await j('qd/reveal', { playerId: id, roundId: s.roundId }); await sleep(200);
assert.equal((await j('qd/finish', { playerId: id, roundId: s.roundId, secret, color: missing(r.board), ms: 5000, wrong: 0 })).status, 400, 'clock mismatch');
// Good round, ranked.
s = await j('qd/start', { playerId: id }); await sleep(s.delayMs);
r = await j('qd/reveal', { playerId: id, roundId: s.roundId }); await sleep(320);
const f = await j('qd/finish', { playerId: id, roundId: s.roundId, secret, color: missing(r.board), ms: 300, wrong: 0 });
assert.ok(f.ok && f.ms === 300 && f.ranked && f.rankToday >= 1, JSON.stringify(f));
assert.equal((await j('qd/finish', { playerId: id, roundId: s.roundId, secret, color: missing(r.board), ms: 300, wrong: 0 })).status, 409, 'no double finish');
// Shaved claim gets corrected to the server span minus lag.
s = await j('qd/start', { playerId: id }); await sleep(s.delayMs);
r = await j('qd/reveal', { playerId: id, roundId: s.roundId }); await sleep(2500);
const c = await j('qd/finish', { playerId: id, roundId: s.roundId, secret, color: missing(r.board), ms: 150, wrong: 0 });
assert.ok(c.ok && c.corrected && c.ms >= 1300, JSON.stringify(c));
const lb = await j(`qd/leaderboard?scope=daily&me=${id}`);
assert.ok(lb.entries.some(e => e.me && e.nickname === nick && e.ms === 300), JSON.stringify(lb));
// Someone else's round can't be finished.
assert.equal((await j('qd/finish', { playerId: crypto.randomUUID(), roundId: s.roundId, color: 1, ms: 300 })).status, 404);
console.log('quickdraw api ok', f, c);
