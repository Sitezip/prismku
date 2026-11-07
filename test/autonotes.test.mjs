// ✨ Fill all notes. BASE=http://127.0.0.1:8787 node test/autonotes.test.mjs
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const OUT = process.env.OUT || '/tmp';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const errors = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const p = await b.newPage();
await p.setViewport({ width: 375, height: 733, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
p.on('pageerror', e => errors.push(e.message));
await p.goto(BASE + '/', { waitUntil: 'networkidle0' });
if (await p.evaluate(() => document.querySelector('#dlg').open)) await p.click('#dlg [data-act="close"]');
await sleep(200);
assert.equal(await p.$eval('#btn-autonotes', e => e.hidden), true, 'hidden while notes off');
await p.click('#btn-notes'); await sleep(150);
assert.equal(await p.$eval('#btn-autonotes', e => e.hidden), false, 'shown with notes on');
await p.click('#btn-autonotes'); await sleep(200);
const r = await p.evaluate(() => {
  const g = window.__prismku.G; const bad = [];
  g.grid.forEach((v, i) => { if (!v && !(g.notes[i] & (1 << g.solution[i]))) bad.push(i); if (v && g.notes[i]) bad.push(i); });
  return { bad, empties: g.grid.filter(v => !v).length, dotted: document.querySelectorAll('#board .notes i:not(.off)').length };
});
assert.deepEqual(r.bad, []); assert.ok(r.dotted >= r.empties, 'dots rendered');
await p.screenshot({ path: `${OUT}/autonotes.png` });
await p.click('#btn-notes'); await sleep(150);
assert.equal(await p.$eval('#btn-autonotes', e => e.hidden), true, 'hidden again');
// Keyboard F with notes on, after a reload (notes persisted).
await p.reload({ waitUntil: 'networkidle0' }); await sleep(200);
const kept = await p.evaluate(() => window.__prismku.G.notes.some(Boolean));
assert.ok(kept, 'notes persist across reload');
assert.deepEqual(errors, []);
await b.close();
console.log('autonotes ui ok');
