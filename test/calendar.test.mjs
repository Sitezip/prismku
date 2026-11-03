// Daily calendar + replay test: BASE=... node test/calendar.test.mjs
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const errs = [];
for (const vp of [{ width: 375, height: 740, isMobile: true, hasTouch: true }, { width: 1440, height: 900 }]) {
  const p = await b.newPage(); await p.setViewport(vp);
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await p.evaluate(() => document.querySelector('#dlg').close());
  // streak math
  const st = await p.evaluate(() => { const s = window.__prismku.streaks;
    return [s(new Set(['2026-11-01', '2026-11-02', '2026-11-03']), '2026-11-03'), s(new Set(['2026-10-31', '2026-11-01', '2026-11-02']), '2026-11-03'), s(new Set(['2026-10-31', '2026-11-02']), '2026-11-04'), s(new Set(), '2026-11-03')]; });
  assert.deepEqual(st, [{ cur: 3, best: 3 }, { cur: 3, best: 3 }, { cur: 0, best: 1 }, { cur: 0, best: 0 }]);
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth); assert.ok(!overflow, 'no overflow with 📅 button');
  // solve today's daily, then open the calendar
  await p.evaluate(() => { const g = window.__prismku.G; g.grid.forEach((v, i) => { if (!g.puzzle[i]) window.__prismku.place(i, g.solution[i]); }); });
  await new Promise(r => setTimeout(r, 1500));
  await p.click('#dlg [data-act="calendar"]'); await new Promise(r => setTimeout(r, 300));
  const cal = await p.evaluate(() => ({ days: document.querySelectorAll('.cal-day').length, today: document.querySelector('.cal-day.today')?.dataset.calday, on: document.querySelectorAll('.cal-day.today .cal-dots i.on').length, txt: document.querySelector('.cal-streak').innerText }));
  console.log(vp.width, cal); assert.ok(cal.days >= 4); assert.equal(cal.on, 1); assert.match(cal.txt, /Streak 1/);
  await p.screenshot({ path: `/tmp/cal-${vp.width}.png` });
  // replay the first day
  const first = await p.$eval('.cal-day', e => e.dataset.calday);
  await p.click('.cal-day'); await new Promise(r => setTimeout(r, 300));
  const g = await p.evaluate(() => ({ play: window.__prismku.G.play, replay: window.__prismku.G.replay, seed: window.__prismku.G.seed, done: window.__prismku.G.done, tip: document.querySelector('#tip').innerText, open: document.querySelector('#dlg').open }));
  console.log(g); assert.equal(g.play, 'free'); assert.equal(g.replay, first); assert.ok(!g.open); assert.match(g.tip, /Replaying Daily #1/);
  await p.evaluate(() => { const g = window.__prismku.G; g.grid.forEach((v, i) => { if (!g.puzzle[i]) window.__prismku.place(i, g.solution[i]); }); });
  await new Promise(r => setTimeout(r, 1500));
  const w = await p.evaluate(() => document.querySelector('#dlg-body h3').innerText); assert.match(w, /Daily #1 replay solved/);
  await p.click('#dlg [data-act="calendar"]'); await new Promise(r => setTimeout(r, 300));
  assert.equal(await p.$$eval(`.cal-day[data-calday="${first}"] .cal-dots i.rp`, x => x.length), 1);
  // ✨ New clears replay
  await p.evaluate(() => document.querySelector('#dlg').close()); await p.click('#btn-new');
  assert.equal(await p.evaluate(() => window.__prismku.G.replay), undefined);
  assert.doesNotMatch(await p.$eval('#tip', e => e.innerText), /Replaying/);
  await p.screenshot({ path: `/tmp/cal-game-${vp.width}.png` });
  await p.close();
}
assert.deepEqual(errs, []); console.log('calendar test passed'); await b.close();
