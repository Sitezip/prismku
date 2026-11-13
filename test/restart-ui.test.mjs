// Ticket #10: Free play Restart starts the timer and counters over, and that run is practice
// (no leaderboard submit, no local best). The daily keeps its clock running.
// BASE=http://127.0.0.1:8787 node test/restart-ui.test.mjs
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage(); await p.setViewport({ width: 375, height: 733, isMobile: true });
const errs = []; p.on('pageerror', e => errs.push(e.message));
const posts = []; p.on('request', r => { if (r.method() === 'POST') posts.push(new URL(r.url()).pathname); });
p.on('dialog', d => d.accept());
await p.goto((process.env.BASE || 'http://127.0.0.1:8787') + '/', { waitUntil: 'networkidle0' });
await p.evaluate(() => document.querySelector('#dlg').close());
const state = () => p.evaluate(() => { const g = window.__prismku.G; return { play: g.play, ms: window.__prismku.elapsed(), moves: g.moves, hints: g.hints, practice: !!g.practice, title: document.querySelector('#btn-restart').title }; });
const firstEmpty = () => p.evaluate(() => { const g = window.__prismku.G; return g.grid.findIndex((v, i) => !v && !g.puzzle[i]); });

// Daily: restart keeps the clock.
await sleep(1200);
let i = await firstEmpty(); await p.evaluate((i) => window.__prismku.place(i, window.__prismku.G.solution[i]), i);
await p.click('#btn-restart'); await sleep(200);
let s = await state();
assert.equal(s.play, 'daily'); assert.ok(s.ms > 1000, 'daily clock keeps running'); assert.equal(s.practice, false);
assert.match(s.title, /timer keeps running/);

// Free play: restart zeroes the clock and counters and marks practice.
await p.click('[data-play="free"]'); await sleep(1500);
i = await firstEmpty(); await p.evaluate((i) => window.__prismku.place(i, window.__prismku.G.solution[i]), i);
s = await state(); assert.equal(s.play, 'free'); assert.ok(s.ms > 1000); assert.ok(s.moves >= 1);
assert.match(s.title, /fresh timer/);
await p.click('#btn-restart'); await sleep(150);
s = await state();
assert.ok(s.ms < 1000, `free clock restarts (got ${s.ms})`); assert.equal(s.moves, 0); assert.equal(s.hints, 0); assert.equal(s.practice, true);
assert.equal(await p.$eval('#hud-moves', el => el.textContent), '0');
await sleep(1100);
assert.ok((await state()).ms >= 1000, 'clock runs again after restart');

// Practice survives a reload and the solve is not submitted or counted as a best.
await p.reload({ waitUntil: 'networkidle0' }); await p.evaluate(() => document.querySelector('#dlg').close());
assert.equal((await state()).practice, true, 'practice flag persists');
const bestsBefore = await p.evaluate(() => localStorage.getItem('pk.bests'));
posts.length = 0;
await p.evaluate(() => { const g = window.__prismku.G; g.grid.forEach((v, i) => { if (!g.puzzle[i] && !v) window.__prismku.place(i, g.solution[i]); }); });
await sleep(1500);
const t = await p.evaluate(() => document.querySelector('#dlg-body').innerText);
assert.match(t, /Practice run/); assert.doesNotMatch(t, /Personal best/);
assert.ok(!posts.includes('/api/scores'), 'practice run is not submitted');
assert.equal(await p.evaluate(() => localStorage.getItem('pk.bests')), bestsBefore, 'practice run does not touch bests');
assert.match(await p.$eval('.share-pre', el => el.textContent), /\(practice\)/);
await p.screenshot({ path: '/tmp/restart-practice.png' });

// A brand-new free board is ranked again.
await p.evaluate(() => document.querySelector('#dlg').close()); await p.click('#btn-new'); await sleep(300);
assert.equal((await state()).practice, false, 'new board is ranked');
assert.deepEqual(errs, []); await b.close(); console.log('restart ui ok');
