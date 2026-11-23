// 🎞️ Solve replay in the browser: BASE=... node test/replay-ui.test.mjs
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 390, height: 800, isMobile: true, hasTouch: true });
const errs = []; p.on('pageerror', e => errs.push(e.message));
const sleep = ms => new Promise(r => setTimeout(r, ms));
await p.goto(BASE + '/', { waitUntil: 'networkidle0' });
await p.evaluate(() => { localStorage.setItem('pk.seenHelp', 'true'); localStorage.setItem('pk.settings', JSON.stringify({ play: 'free', mode: 'hard', sound: false })); });
await p.reload({ waitUntil: 'networkidle0' }); await sleep(300);
await p.evaluate(() => document.querySelector('#dlg').open && document.querySelector('#dlg').close());
// Solve with a wrong turn (undone), an erase-and-fix, and a hint.
const info = await p.evaluate(() => {
  const k = window.__prismku, G = k.G, n = 6;
  const empties = G.puzzle.map((v, i) => v ? -1 : i).filter(i => i >= 0);
  const [a, c] = empties; const wrong = G.solution[a] % n + 1;
  k.place(a, wrong); k.undo(); k.place(c, G.solution[c] % n + 1); k.place(c, G.solution[c]);
  if (k.canReplay()) return { early: true };
  k.hint();
  for (const i of empties) if (G.grid[i] !== G.solution[i]) k.place(i, G.solution[i]);
  return { log: G.log.length, empties: empties.length, done: G.done, replayable: k.canReplay() };
});
console.log(info);
assert.ok(!info.early, 'no replay before the win');
assert.ok(info.done && info.replayable, 'solved board can replay');
await sleep(1600);
assert.ok(await p.$('#dlg [data-act="replay"]'), 'win dialog has Replay');
await p.click('#dlg [data-act="replay"]'); await sleep(200);
const cells = await p.$$eval('#rp-board .rp-cell', x => x.length); assert.equal(cells, 36);
const givens = await p.$$eval('#rp-board .rp-cell.given', x => x.length);
assert.equal(await p.$$eval('#rp-board .rp-cell.filled', x => x.length), 0, 'starts from the starting tiles');
await sleep(1500);
const mid = await p.$$eval('#rp-board .rp-cell.filled', x => x.length); assert.ok(mid > 0, 'tiles appear during playback');
await p.screenshot({ path: '/tmp/replay-mid.png' });
await sleep(7000);
const end = await p.evaluate(() => ({ filled: document.querySelectorAll('#rp-board .rp-cell.filled').length, wrong: document.querySelectorAll('#rp-board .rp-cell.wrong').length,
  hint: document.querySelectorAll('#rp-board .rp-cell.hint').length, done: document.querySelector('#rp-board').classList.contains('done'), step: document.querySelector('#rp-step').textContent, clock: document.querySelector('#rp-clock').textContent }));
console.log(end, givens);
assert.equal(end.filled + givens, 36, 'ends on the solved board'); assert.equal(end.wrong, 0); assert.ok(end.done);
assert.equal(+end.step, info.log);
await p.screenshot({ path: '/tmp/replay-end.png' });
// Back to result, then the solved board's tip link reopens it; restoring after reload keeps it.
await p.click('#dlg [data-act="showwin"]'); await sleep(200);
assert.ok(await p.$('#win-score'), 'back to the result');
await p.reload({ waitUntil: 'networkidle0' }); await sleep(300);
await p.evaluate(() => document.querySelector('#dlg').open && document.querySelector('#dlg').close());
assert.ok(await p.$('#tip [data-act="replay"]') || await p.evaluate(() => window.__prismku.canReplay()), 'replay survives a reload');
await p.evaluate(() => window.__prismku.showReplay()); await sleep(200);
assert.ok(await p.$('#rp-board'), 'replay reopens after reload');
assert.deepEqual(errs, []); await b.close(); console.log('replay ui ok');
