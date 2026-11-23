import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage(); await p.setViewport({ width: 360, height: 740, isMobile: true });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto((process.env.BASE || 'http://127.0.0.1:8787') + '/', { waitUntil: 'networkidle0' });
await p.evaluate(() => document.querySelector('#dlg').close());
// Fill row 1 with the solution except its last empty tile, then place that one: the row should shimmer.
const r = await p.evaluate(async () => {
  const k = window.__prismku, g = k.G, n = Math.sqrt(g.grid.length);
  const empties = [];
  for (let c = 0; c < n; c++) if (!g.puzzle[c]) empties.push(c);
  for (const c of empties.slice(0, -1)) k.place(c, g.solution[c]);
  // (placing an earlier tile may already finish a column or box, so only check that this row isn't lit yet)
  const before = [...document.querySelectorAll('#board .cell.sweep')].map(e => +e.dataset.i).filter(i => i < n).length;
  const last = empties.at(-1); k.place(last, g.solution[last]);
  await new Promise(r => setTimeout(r, 50));
  const lit = [...document.querySelectorAll('#board .cell.sweep')].map(e => +e.dataset.i);
  return { before, lit, n, empties: empties.length };
});
console.log(r);
assert.ok(r.before < r.n, 'row not complete before its last tile');
for (let c = 0; c < r.n; c++) assert.ok(r.lit.includes(c), 'row tile ' + c);
await p.screenshot({ path: '/tmp/sweep.png' });
await new Promise(r => setTimeout(r, 2200));
assert.equal(await p.$$eval('#board .cell.sweep', x => x.length), 0);
assert.deepEqual(errs, []); await b.close(); console.log('sweep ui ok');
