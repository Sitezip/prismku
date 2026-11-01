// Ticket #2 (box divider off-center) + #3 (timer ran under the how-to). BASE=... node test/pause-grid.test.mjs
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const errors = [];
for (const vp of [{ width: 375, height: 733, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, { width: 1280, height: 800 }]) {
  const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport(vp); // fresh storage = first visit
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(BASE + '/', { waitUntil: 'networkidle0' });
  // First visit: help is open, clock paused, board veiled.
  assert.ok(await p.evaluate(() => document.querySelector('#dlg').open), 'help shown on first visit');
  await sleep(1600);
  let st = await p.evaluate(() => ({ t: document.querySelector('#hud-time').textContent, paused: document.body.classList.contains('paused') }));
  assert.equal(st.t, '0:00', 'timer stays at 0:00 while reading help'); assert.ok(st.paused, 'board veiled while paused');
  await p.click('#dlg [data-act="close"].primary');
  await sleep(2300);
  st = await p.evaluate(() => ({ t: document.querySelector('#hud-time').textContent, paused: document.body.classList.contains('paused') }));
  assert.ok(!st.paused, 'running after Let’s play'); assert.ok(st.t === '0:02' || st.t === '0:01', 'timer runs after closing help: ' + st.t);
  // Leaderboard dialog pauses too; Esc resumes.
  await p.click('#btn-help'); await sleep(1500);
  const t1 = await p.evaluate(() => window.__prismku.G && document.querySelector('#hud-time').textContent);
  assert.equal(t1, st.t, 'paused while help reopened'); await p.keyboard.press('Escape'); await sleep(200);
  assert.ok(!(await p.evaluate(() => document.body.classList.contains('paused'))), 'Esc resumes');
  // Rows equal and every divider sits in the middle of its gap, on every boxed size.
  for (const mode of ['easy', 'hard', 'expert']) {
    await p.click(`#diff [data-mode="${mode}"]`); await sleep(250);
    const r = await p.evaluate(() => {
      const cells = [...document.querySelectorAll('#board .cell')].map(c => c.getBoundingClientRect());
      const n = Math.round(Math.sqrt(cells.length)), off = [];
      const rows = [...Array(n)].map((_, i) => cells[i * n]), cols = cells.slice(0, n);
      for (const l of document.querySelectorAll('#board .rline')) {
        const k = +getComputedStyle(l).getPropertyValue('--k'), lr = l.getBoundingClientRect(), h = l.classList.contains('h');
        const mid = h ? (lr.top + lr.bottom) / 2 : (lr.left + lr.right) / 2;
        const gap = h ? (rows[k - 1].bottom + rows[k].top) / 2 : (cols[k - 1].right + cols[k].left) / 2;
        off.push(Math.abs(mid - gap));
      }
      const hs = rows.map(c => c.height);
      return { off: Math.max(...off), spread: Math.max(...hs) - Math.min(...hs) };
    });
    assert.ok(r.off < 1, `${mode} ${vp.width}: divider off by ${r.off}px`); assert.ok(r.spread < 1, `${mode} ${vp.width}: uneven rows ${r.spread}px`);
  }
  await ctx.close();
}
await b.close();
assert.deepEqual(errors, []);
console.log('pause + grid tests passed');
