// Notes mode + leaderboard dialog regressions (issues #1, #2): BASE=... node test/notes-lb.test.mjs
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const errors = [];
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
p.on('pageerror', e => errors.push(e.message));
await p.goto(BASE + '/', { waitUntil: 'networkidle0' });
await p.evaluate(() => document.querySelector('#dlg').close());
// leaderboard: switch tabs quickly, then close; dialog must close and stay closed
await p.click('#btn-board'); await p.click('[data-lbscope="all"]'); await p.click('[data-lbmode="expert"]'); await p.click('[data-lbscope="week"]');
await p.tap('#dlg .btn.x'); await sleep(800);
assert.equal(await p.evaluate(() => document.querySelector('#dlg').open), false, 'leaderboard closes');
await p.click('#btn-board'); await sleep(600);
await p.click('#dlg .btn.x'); await sleep(300);
assert.equal(await p.evaluate(() => document.querySelector('#dlg').open), false, 'leaderboard closes after load');
// size switching renders a fresh board each time with the right cell count
for (const [m, n] of [['expert', 81], ['easy', 16], ['hard', 36], ['medium', 25], ['expert', 81]]) {
  await p.click(`#diff [data-mode="${m}"]`); await sleep(150);
  assert.equal(await p.$$eval('#board', x => x.length), 1); assert.equal(await p.$$eval('#board .cell', c => c.length), n, m);
}
// tap still selects after board swap
await p.click('#diff [data-mode="easy"]'); await sleep(150);
const idx = await p.evaluate(() => window.__prismku.G.grid.findIndex(v => !v));
await p.tap(`#board .cell[data-i="${idx}"]`);
assert.ok(await p.$eval(`#board .cell[data-i="${idx}"]`, c => c.classList.contains('sel')), 'cell selected');
// notes
await p.click('#btn-notes');
await p.tap('#palette .swatch[data-v="1"]'); await p.tap('#palette .swatch[data-v="3"]');
let dots = await p.$$eval(`#board .cell[data-i="${idx}"] .notes i:not(.off)`, d => d.length);
assert.equal(dots, 2, 'two pencil dots');
assert.equal(await p.evaluate(i => window.__prismku.G.grid[i], idx), 0, 'notes do not fill');
await p.screenshot({ path: '/tmp/notes.png' });
await p.click('#btn-notes'); // off
const sol = await p.evaluate(i => window.__prismku.G.solution[i], idx);
await p.tap(`#palette .swatch[data-v="${sol}"]`);
assert.equal(await p.evaluate(i => window.__prismku.G.grid[i], idx), sol, 'real placement');
assert.equal(await p.evaluate(i => window.__prismku.G.notes[i], idx), 0, 'notes cleared on placement');
// persists across reload
await p.click('#btn-notes');
const idx2 = await p.evaluate(() => window.__prismku.G.grid.findIndex(v => !v));
await p.tap(`#board .cell[data-i="${idx2}"]`); await p.tap('#palette .swatch[data-v="2"]');
await p.reload({ waitUntil: 'networkidle0' });
assert.ok(await p.evaluate(i => window.__prismku.G.notes[i] & 4, idx2), 'notes persisted');
assert.deepEqual(errors, []);
await b.close();
console.log('notes + leaderboard tests passed');
