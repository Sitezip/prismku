import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage(); await p.setViewport({ width: 360, height: 740, isMobile: true });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto((process.env.BASE || 'http://127.0.0.1:8787') + '/', { waitUntil: 'networkidle0' });
await p.evaluate(() => document.querySelector('#dlg').close());
assert.equal(await p.$$eval('.board.spot', x => x.length), 0);
// arm color 1 from the palette
await p.click('.swatch[data-v="1"]'); await new Promise(r => setTimeout(r, 200));
const r = await p.evaluate(() => {
  const g = window.__prismku.G, cells = [...document.querySelectorAll('#board .cell')];
  return { spot: document.querySelector('#board').classList.contains('spot'),
    same: cells.filter(c => c.classList.contains('same')).length, want: g.grid.filter(v => v === 1).length,
    blocked: cells.filter(c => c.classList.contains('blocked')).length, open: cells.filter(c => c.classList.contains('open')).length,
    solOpen: g.solution.every((v, i) => g.grid[i] || v !== 1 || cells[i].classList.contains('open')) };
});
console.log(r); assert.ok(r.spot); assert.equal(r.same, r.want); assert.ok(r.blocked > 0 && r.open > 0); assert.ok(r.solOpen);
await p.screenshot({ path: '/tmp/spotlight.png' });
// let go: spotlight off
await p.click('.swatch[data-v="1"]'); await new Promise(r => setTimeout(r, 200));
assert.equal(await p.$$eval('.board.spot', x => x.length), 0);
// tapping a colored given tile spotlights its color
const gi = await p.evaluate(() => window.__prismku.G.puzzle.findIndex(v => v));
await p.click(`#board .cell[data-i="${gi}"]`); await new Promise(r => setTimeout(r, 200));
assert.equal(await p.$$eval('.board.spot', x => x.length), 1);
// solved board: no spotlight
await p.evaluate(() => { const g = window.__prismku.G; g.grid.forEach((v, i) => { if (!g.puzzle[i] && !v) window.__prismku.place(i, g.solution[i]); }); });
await new Promise(r => setTimeout(r, 1500));
assert.equal(await p.$$eval('.board.spot', x => x.length), 0);
assert.deepEqual(errs, []); await b.close(); console.log('spotlight ui ok');
