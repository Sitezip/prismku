import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const errors = [];
for (const [mode, path] of [['expert','/'],['medium','/'],['easy','/v/2026-11-08/']]) {
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, isMobile: true });
  p.on('pageerror', e => errors.push(e.message));
  await p.goto((process.env.BASE || 'http://127.0.0.1:8787') + path, { waitUntil: 'networkidle0' });
  await p.evaluate(() => document.querySelector('#dlg').close());
  await p.click(`#diff button[data-mode="${mode}"]`); await new Promise(r => setTimeout(r, 400));
  await p.keyboard.press('h'); await new Promise(r => setTimeout(r, 400));
  const r = await p.evaluate(() => ({ toast: document.querySelector('#toast').textContent, why: document.querySelectorAll('#board .cell.why').length, hinted: document.querySelectorAll('#board .cell.hinted').length }));
  console.log(mode, path, r);
  assert.ok(/only/.test(r.toast) && r.why > 0 && r.hinted === 1);
  await p.screenshot({ path: `${process.env.OUT || '/tmp'}/hint-${mode}.png` });
  await new Promise(r => setTimeout(r, 4600));
  assert.equal(await p.evaluate(() => document.querySelectorAll('#board .cell.why').length), 0, 'glow clears');
}
assert.deepEqual(errors, []); await b.close(); console.log('hint ui ok');
