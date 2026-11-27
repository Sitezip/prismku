// Multi-select notes (ticket #13): drag (mouse and touch) or Ctrl-click several tiles, then one color pencils them all.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const BASE = (process.env.BASE || 'http://127.0.0.1:8787') + '/';
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const errs = [];
async function open(viewport) {
  const p = await b.newPage(); await p.setViewport(viewport);
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE, { waitUntil: 'networkidle0' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('pk.seenHelp', 'true'); });
  await p.goto(BASE, { waitUntil: 'networkidle0' });
  await p.evaluate(() => document.querySelector('#dlg').open && document.querySelector('#dlg').close());
  return p;
}
const center = (p, i) => p.$eval(`#board .cell[data-i="${i}"]`, c => { const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
// empty tiles in the first row with an empty neighbor run
const emptyRun = (p) => p.evaluate(() => { const g = window.__prismku.G; const out = []; g.grid.forEach((v, i) => { if (!v) out.push(i); }); return out; });

// --- desktop: mouse drag + ctrl-click + erase ---
{
  const p = await open({ width: 1100, height: 900 });
  await p.click('#btn-notes'); await wait(150);
  const empties = await emptyRun(p);
  const [a, c2] = [empties[0], empties[empties.length - 1]];
  const pa = await center(p, a), pc = await center(p, c2);
  await p.mouse.move(pa.x, pa.y); await p.mouse.down();
  for (let k = 1; k <= 12; k++) await p.mouse.move(pa.x + (pc.x - pa.x) * k / 12, pa.y + (pc.y - pa.y) * k / 12);
  await p.mouse.up(); await wait(150);
  const sel = await p.evaluate(() => window.__prismku.multi);
  console.log('drag selected', sel.length);
  assert.ok(sel.length >= 2, 'drag selects several tiles');
  assert.equal(await p.$$eval('#board .cell.msel', x => x.length), sel.length);
  assert.equal(await p.$eval('#multi-bar', e => e.hidden), false);
  await p.click('.swatch[data-v="2"]'); await wait(150);
  let r = await p.evaluate(() => { const g = window.__prismku.G; return window.__prismku.multi.map(i => ({ i, empty: !g.grid[i], n: g.notes[i], v: g.grid[i] })); });
  assert.ok(r.every(t => t.empty ? t.n & 4 : t.n === 0), 'every selected empty tile got color 2');
  assert.ok(r.some(t => t.empty));
  assert.ok(r.every(t => sel.includes(t.i)));
  // grid untouched (notes only)
  // tap again: removes from all
  await p.click('.swatch[data-v="2"]'); await wait(150);
  r = await p.evaluate(() => { const g = window.__prismku.G; return window.__prismku.multi.map(i => g.notes[i]); });
  assert.ok(r.every(n => !(n & 4)), 'second tap takes it back out');
  // keyboard digit + erase
  await p.keyboard.press('3'); await wait(100);
  r = await p.evaluate(() => { const g = window.__prismku.G; return window.__prismku.multi.filter(i => !g.grid[i]).map(i => g.notes[i]); });
  assert.ok(r.every(n => n & 8));
  await p.click('#btn-erase'); await wait(100);
  r = await p.evaluate(() => { const g = window.__prismku.G; return window.__prismku.multi.map(i => g.notes[i]); });
  assert.ok(r.every(n => n === 0), 'erase clears notes in all');
  // plain tap goes back to one tile
  await p.click(`#board .cell[data-i="${empties[1]}"]`); await wait(100);
  assert.equal((await p.evaluate(() => window.__prismku.multi)).length, 0);
  assert.equal(await p.$eval('#multi-bar', e => e.hidden), true);
  // ctrl-click builds a selection even with Notes off; colors still go in as notes, not placements
  await p.click('#btn-notes'); await wait(100);
  await p.keyboard.down('Control'); await p.click(`#board .cell[data-i="${empties[2]}"]`); await p.click(`#board .cell[data-i="${empties[3]}"]`); await p.keyboard.up('Control');
  await wait(100);
  assert.equal((await p.evaluate(() => window.__prismku.multi)).length, 3);
  const before = await p.evaluate(() => window.__prismku.G.grid.join(''));
  await p.click('.swatch[data-v="1"]'); await wait(100);
  r = await p.evaluate((e) => { const g = window.__prismku.G; return { grid: g.grid.join(''), notes: e.map(i => g.notes[i]) }; }, empties.slice(1, 4));
  assert.equal(r.grid, before, 'no tiles placed');
  assert.ok(r.notes.every(n => n & 2));
  await p.keyboard.press('Escape'); await wait(100);
  assert.equal((await p.evaluate(() => window.__prismku.multi)).length, 0);
  // notes persist across reload
  await p.reload({ waitUntil: 'networkidle0' });
  assert.ok(await p.evaluate((i) => !!(window.__prismku.G.notes[i] & 2), empties[2]));
  await p.screenshot({ path: '/tmp/multisel-desktop.png' });
  await p.close();
}
// --- phone: touch drag ---
{
  const p = await open({ width: 390, height: 800, isMobile: true, hasTouch: true });
  await p.tap('#btn-notes'); await wait(150);
  const empties = await emptyRun(p);
  const pa = await center(p, empties[0]), pc = await center(p, empties[Math.min(5, empties.length - 1)]);
  await p.touchscreen.touchStart(pa.x, pa.y);
  for (let k = 1; k <= 10; k++) await p.touchscreen.touchMove(pa.x + (pc.x - pa.x) * k / 10, pa.y + (pc.y - pa.y) * k / 10);
  // Wait past the emulated double-tap window (~300 ms) before the next tap, or Chrome drops its click.
  await p.touchscreen.touchEnd(); await wait(450);
  const sel = await p.evaluate(() => window.__prismku.multi);
  console.log('touch selected', sel.length);
  assert.ok(sel.length >= 2, 'touch drag selects several tiles');
  await p.tap('.swatch[data-v="1"]'); await wait(150);
  const ok = await p.evaluate(() => { const g = window.__prismku.G; return window.__prismku.multi.filter(i => !g.grid[i]).every(i => g.notes[i] & 2); });
  assert.ok(ok);
  await p.screenshot({ path: '/tmp/multisel-phone.png' });
  // Notes off: a drag doesn't select (page can scroll)
  await p.tap('#multi-clear'); await p.tap('#btn-notes'); await wait(100);
  await p.touchscreen.touchStart(pa.x, pa.y); await p.touchscreen.touchMove(pc.x, pc.y); await p.touchscreen.touchEnd(); await wait(150);
  assert.equal((await p.evaluate(() => window.__prismku.multi)).length, 0);
  await p.close();
}
assert.deepEqual(errs, []); await b.close(); console.log('multisel ui ok');
