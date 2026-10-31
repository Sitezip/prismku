// Headless UI test (mobile + desktop): BASE=... node test/ui.test.mjs
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const OUT = process.env.OUT || '/tmp';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const errors = [];
async function run(name, vp, path = '/') {
  const p = await b.newPage(); await p.setViewport(vp);
  p.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });
  await p.goto(BASE + path, { waitUntil: 'networkidle0' });
  await p.screenshot({ path: `${OUT}/ui-${name}-help.png` });
  await p.evaluate(() => document.querySelector('#dlg').close());
  // play a few real taps
  const empty = await p.$$('#board .cell.empty'); await empty[0].click();
  await p.click('#palette .swatch[data-v="1"]');
  await p.screenshot({ path: `${OUT}/ui-${name}-play.png` });
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.ok(!overflow, `${name}: horizontal overflow`);
  // solve via the game API
  await p.evaluate(() => { const g = window.__prismku.G; g.grid.forEach((v, i) => { if (!g.puzzle[i]) window.__prismku.place(i, g.solution[i]); }); });
  await new Promise(r => setTimeout(r, 1500));
  const dlg = await p.evaluate(() => document.querySelector('#dlg').open && document.querySelector('#dlg-body').innerText);
  assert.ok(dlg && /solved/i.test(dlg), `${name}: win dialog shown`);
  if (/Nickname/.test(dlg) && !path.startsWith('/v/')) {
    await p.type('#nick', 'UiBot' + Math.floor(Math.random() * 99));
    await p.click('[data-act="save-nick"]'); await new Promise(r => setTimeout(r, 1500));
  }
  await p.screenshot({ path: `${OUT}/ui-${name}-win.png` });
  const txt = await p.evaluate(() => document.querySelector('#dlg-body').innerText);
  console.log(name, '→', txt.replace(/\s+/g, ' ').slice(0, 220));
  // expert board renders
  await p.evaluate(() => document.querySelector('#dlg').close());
  await p.click('#diff [data-mode="expert"]'); await new Promise(r => setTimeout(r, 300));
  const n = await p.$$eval('#board .cell', c => c.length); assert.equal(n, 81);
  await p.click('#btn-cb');
  await p.screenshot({ path: `${OUT}/ui-${name}-expert.png` });
  await p.close();
}
await run('mobile', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await run('desktop', { width: 1280, height: 860 });
if (process.env.ARCHIVE) await run('archive', { width: 390, height: 844, isMobile: true, hasTouch: true }, process.env.ARCHIVE);
await b.close();
assert.deepEqual(errors, [], errors.join('\n'));
console.log('UI tests passed');
