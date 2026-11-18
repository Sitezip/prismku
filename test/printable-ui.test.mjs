// BASE=... node test/printable-ui.test.mjs
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, isMobile: true });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(BASE + '/printable/', { waitUntil: 'networkidle0' });
let s = await p.evaluate(() => ({ url: location.search, n: document.querySelectorAll('.page:not(.answers) .pz').length, a: document.querySelectorAll('.answers .pz').length,
  cells: document.querySelectorAll('.page:not(.answers) .pz:first-child .g i').length, link: document.querySelector('.pz .link').textContent }));
console.log(s); assert.match(s.url, /size=easy&n=4&style=color&answers=1&seed=[0-9a-z]{6}/); assert.equal(s.n, 4); assert.equal(s.a, 4); assert.equal(s.cells, 16); assert.match(s.link, /prismku\.com\/c\/e[0-9a-z]+$/);
await p.screenshot({ path: '/tmp/printable-mobile.png', fullPage: true });
// shareable URL reproduces the same sheet
const seeds = await p.$$eval('.pz[data-seed]', x => x.map(e => e.dataset.seed));
await p.goto(BASE + '/printable/' + s.url, { waitUntil: 'networkidle0' });
assert.deepEqual(await p.$$eval('.pz[data-seed]', x => x.map(e => e.dataset.seed)), seeds);
// options: expert, 2 boards, crayon, no answers
await p.select('#o-size', 'expert'); await p.select('#o-n', '2'); await p.select('#o-style', 'crayon'); await p.click('#o-ans');
s = await p.evaluate(() => ({ url: location.search, n: document.querySelectorAll('.pz').length, crayon: !!document.querySelector('.page.crayon'), cells: document.querySelectorAll('.pz:first-child .g i').length,
  thick: document.querySelectorAll('.pz:first-child .g i.br').length, filled: document.querySelectorAll('.pz:first-child .g i.f').length }));
console.log(s); assert.equal(s.n, 2); assert.ok(s.crayon); assert.equal(s.cells, 81); assert.equal(s.thick, 18); assert.equal(s.filled, 30); assert.match(s.url, /size=expert&n=2&style=crayon&answers=0/);
await p.click('#o-new'); assert.notDeepEqual(await p.$$eval('.pz[data-seed]', x => x.map(e => e.dataset.seed)), seeds);
// printed board link opens that exact puzzle in the game
const code = await p.$eval('.pz .link', e => e.textContent.split('/c/')[1]);
const given = await p.$$eval('.pz:first-child .g i', x => x.map(e => e.classList.contains('f') ? 1 : 0));
await p.emulateMediaType('print'); await p.screenshot({ path: '/tmp/printable-print.png', fullPage: true }); await p.emulateMediaType(null);
const g = await b.newPage(); g.on('pageerror', e => errs.push(e.message));
await g.goto(BASE + '/c/' + code, { waitUntil: 'networkidle0' });
const game = await g.evaluate(() => window.__prismku.G.puzzle.map(v => v ? 1 : 0));
assert.deepEqual(game, given);
assert.deepEqual(errs, []); await b.close(); console.log('printable ui ok');
