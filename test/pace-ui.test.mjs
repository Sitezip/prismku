import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage(); await p.setViewport({ width: 360, height: 740, isMobile: true });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto((process.env.BASE || 'http://127.0.0.1:8787') + '/', { waitUntil: 'networkidle0' });
await p.evaluate(() => document.querySelector('#dlg').close());
const r0 = await p.evaluate(() => ({ pb: document.querySelector('#hud-pb').textContent, pace: document.querySelector('#hud-time').parentElement.dataset.pace }));
assert.equal(r0.pb, ''); assert.equal(r0.pace, 'none');
// solve once
await p.evaluate(() => { const g = window.__prismku.G; g.grid.forEach((v, i) => { if (!g.puzzle[i]) window.__prismku.place(i, g.solution[i]); }); });
await new Promise(r => setTimeout(r, 1500));
// fake a slow old best, then start a new free game
await p.evaluate(() => { const k = 'pk.bests'; const bs = JSON.parse(localStorage.getItem(k)); const m = window.__prismku.G.mode; bs[m].fastest = 3600000; localStorage.setItem(k, JSON.stringify(bs)); document.querySelector('#dlg').close(); });
await p.click('[data-play="free"]'); await new Promise(r => setTimeout(r, 800));
const r1 = await p.evaluate(() => ({ pb: document.querySelector('#hud-pb').textContent, pace: document.querySelector('#hud-time').parentElement.dataset.pace, overflow: document.documentElement.scrollWidth > innerWidth }));
console.log(r1); assert.match(r1.pb, /^PB 1:00:00$/); assert.equal(r1.pace, 'ahead'); assert.ok(!r1.overflow);
await p.screenshot({ path: '/tmp/pace-hud.png' });
await p.evaluate(() => { const g = window.__prismku.G; g.grid.forEach((v, i) => { if (!g.puzzle[i] && !v) window.__prismku.place(i, g.solution[i]); }); });
await new Promise(r => setTimeout(r, 1500));
const t = await p.evaluate(() => document.querySelector('#dlg-body').innerText);
assert.match(t, /quicker than your old best/); console.log('win ok');
assert.deepEqual(errs, []); await b.close(); console.log('pace ui ok');
