// API smoke test: BASE=http://127.0.0.1:8787 node test/api.test.mjs
import assert from 'node:assert/strict';
import { generate, gridToString, dailySeed } from '../client/puzzle.js';
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const j = async (p, body) => { const r = await fetch(BASE + '/api/' + p, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}); return { status: r.status, ...(await r.json()) }; };
const id = crypto.randomUUID(), secret = 'testsecret_' + Math.random().toString(36).slice(2, 14) + 'abcdefgh';
const h = await j('health'); assert.ok(h.ok); const day = h.day;
assert.equal((await j('player', { id, secret, nickname: 'x' })).status, 400, 'short nick rejected');
assert.equal((await j('player', { id, secret, nickname: 'Big Shit' })).status, 400, 'profanity rejected');
const nick = 'Tester' + Math.floor(Math.random() * 999);
assert.ok((await j('player', { id, secret, nickname: nick })).ok);
assert.equal((await j('player', { id, secret: 'wrongsecretwrongsecret1', nickname: 'Hijack' })).status, 403, 'impersonation blocked');
const d = await j('daily?mode=easy'); assert.equal(d.seed, dailySeed(day, 'easy'));
const p = generate('easy', d.seed);
const base = { playerId: id, secret, mode: 'easy', seed: d.seed, daily: true, day, timeMs: 15000, moves: 9, hints: 0, mistakes: 0, version: 'test' };
const wrong = p.solution.slice(); const e = p.puzzle.findIndex(v => !v); wrong[e] = wrong[e] % 4 + 1;
assert.equal((await j('scores', { ...base, grid: gridToString(wrong) })).status, 400, 'invalid grid rejected');
assert.equal((await j('scores', { ...base, grid: gridToString(p.solution), timeMs: 100 })).status, 400, 'too-fast rejected');
assert.equal((await j('scores', { ...base, grid: gridToString(p.solution), seed: d.seed + 1 })).status, 400, 'wrong daily seed rejected');
// Server clock: board shown (start), solved ~5s later (finish), client claims 15s → accepted as is, ranked.
assert.ok((await j('play/start', { playerId: id, mode: 'easy', seed: d.seed })).ok);
assert.equal((await j('play/finish', { playerId: id, mode: 'easy', seed: d.seed, grid: gridToString(wrong) })).status, 400, 'finish needs a real solution');
await new Promise(r => setTimeout(r, 5000));
assert.ok((await j('play/finish', { playerId: id, mode: 'easy', seed: d.seed, grid: gridToString(p.solution) })).ok);
const ok = await j('scores', { ...base, grid: gridToString(p.solution) });
assert.ok(ok.ok && ok.ranked && ok.timeMs === 15000 && !ok.clock, JSON.stringify(ok)); console.log('score', ok);
assert.equal((await j('scores', { ...base, grid: gridToString(p.solution) })).status, 409, 'duplicate daily rejected');
const f = generate('hard', 12345);
await j('play/start', { playerId: id, mode: 'hard', seed: 12345 });
await new Promise(r => setTimeout(r, 20000));
await j('play/finish', { playerId: id, mode: 'hard', seed: 12345, grid: gridToString(f.solution) });
// Exploit: claims 10s for a board first shown 20s ago → corrected to the server span (minus 3s slack).
const ok2 = await j('scores', { ...base, mode: 'hard', seed: 12345, daily: false, grid: gridToString(f.solution), timeMs: 10000, moves: 30 });
assert.ok(ok2.ok && ok2.clock === 'clock' && ok2.timeMs >= 16500, JSON.stringify(ok2));
// No start stamp at all → stored but unranked.
const f2 = generate('hard', 777);
const un = await j('scores', { ...base, mode: 'hard', seed: 777, daily: false, grid: gridToString(f2.solution), timeMs: 45000, moves: 30 });
assert.ok(un.ok && un.ranked === false && un.clock === 'unverified' && !un.allTimeRecord, JSON.stringify(un));
const lb = await j(`leaderboard?mode=easy&scope=daily&me=${id}`); assert.ok(lb.entries.some(x => x.me && x.nickname === nick));
const lb2 = await j('leaderboard?mode=hard&scope=all'); assert.ok(lb2.entries.length >= 1);
const me = await j('me?id=' + id); assert.ok(me.achievements.length >= 2); console.log('me', me.achievements.map(a => a.code));
const st = await j('stats'); assert.ok(st.gamesTotal >= 2); console.log('stats', st);
assert.equal((await j('nope')).status, 404);
console.log('API tests passed against', BASE);

// Feedback tickets
{
  const ctx = { version: 'test', mode: 'easy', seed: 1, ua: 'api-test', screen: '1x1' };
  assert.equal((await j('feedback', { type: 'nope', message: 'hello there' })).status, 400, 'bad type');
  assert.equal((await j('feedback', { type: 'bug', message: 'hi' })).status, 400, 'too short');
  assert.equal((await j('feedback', { type: 'bug', message: 'x'.repeat(1001) })).status, 400, 'too long');
  assert.equal((await j('feedback', { type: 'bug', message: 'valid message', contact: 'not-an-email' })).status, 400, 'bad email');
  const hp = await j('feedback', { type: 'bug', message: 'spam spam spam', website: 'http://spam' });
  assert.ok(hp.ok && hp.id === null, 'honeypot silently dropped');
  const fb = await j('feedback', { type: 'idea', message: 'API TEST TICKET — delete me', contact: 'test@example.com', context: ctx });
  assert.ok(fb.ok && fb.id > 0, JSON.stringify(fb));
  console.log('feedback ticket id', fb.id);
}
console.log('feedback tests passed');
