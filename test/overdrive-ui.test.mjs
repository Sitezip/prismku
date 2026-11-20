// ⚡ Overdrive win screen: a solve past 2.5× par shows the bonus and a score above the old ceiling.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage(); await p.setViewport({ width: 360, height: 740, isMobile: true });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto((process.env.BASE || 'http://127.0.0.1:8787') + '/', { waitUntil: 'networkidle0' });
await p.evaluate(() => document.querySelector('#dlg').close());
const mode = await p.evaluate(() => window.__prismku.G.mode);
await p.evaluate(() => { const g = window.__prismku.G; g.grid.forEach((v, i) => { if (!g.puzzle[i] && !v) window.__prismku.place(i, g.solution[i]); }); });
await new Promise(r => setTimeout(r, 1500));
const r = await p.evaluate(() => ({ big: document.querySelector('#win-score .big')?.textContent, od: document.querySelector('#win-score .od-note')?.innerText || '',
  cls: document.querySelector('#win-score .big')?.className, overflow: document.documentElement.scrollWidth > innerWidth }));
console.log(mode, r);
const ceiling = { easy: 1250, medium: 2250, hard: 3750, expert: 10000 }[mode];
const pts = parseInt(r.big, 10);
assert.ok(pts > ceiling, `score ${pts} should pass ${ceiling}`);
assert.match(r.od, /Overdrive \+[\d,]+ past the [\d,]+ pace line/);
assert.equal(parseInt(r.od.match(/\+([\d,]+)/)[1].replace(/,/g, ''), 10), pts - ceiling);
assert.match(r.cls, /overdrive/); assert.ok(!r.overflow);
await p.screenshot({ path: '/tmp/overdrive-win.png' });
assert.deepEqual(errs, []); await b.close(); console.log('overdrive ui ok');
