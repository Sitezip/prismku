// Ticket #7 (sticky paint on a phone) and #6 (restart after solve).
// BASE=http://127.0.0.1:8787 node test/paint.test.mjs
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

const empty = () => p.evaluate(() => {
  const g = window.__prismku.G;
  return g.grid.map((v, i) => (!v && !g.puzzle[i] ? i : -1)).filter(i => i >= 0);
});
const brush = () => p.evaluate(() => document.querySelector('.swatch.brush')?.dataset.v || '0');
const cellCol = (i) => p.evaluate((i) => {
  const c = document.querySelector(`#board .cell[data-i="${i}"]`);
  return { filled: c.classList.contains('filled'), col: c.style.getPropertyValue('--col'), noted: c.classList.contains('noted') };
}, i);

// Notes still pencil-mark a selected tile and do not arm paint.
await p.click('#btn-notes');
let [a, c] = await empty();
await p.click(`#board .cell[data-i="${a}"]`);
await p.click('#palette .swatch[data-v="1"]');
let st = await cellCol(a);
assert.equal(await brush(), '0', 'notes tap must not arm paint');
assert.equal(st.noted, true, 'notes dot placed');
assert.equal(st.filled, false);
await p.click('#btn-notes');

// Cell first, then a color: places that color and does not stick.
await p.click(`#board .cell[data-i="${c}"]`);
await p.click('#palette .swatch[data-v="2"]');
st = await cellCol(c);
assert.equal(st.filled, true);
assert.match(st.col, /--c2/);
assert.equal(await brush(), '0', 'cell-first must not arm paint');
assert.equal(await p.$eval('#paint-stop', el => el.hidden), true);

// Ticket #7, at the reported 375×733 phone size: arm a color, paint a tile, then tap that color again.
const rest = (await empty()).filter(i => i !== c);
const d = rest[0], e2 = rest[1];
await p.keyboard.press('Escape'); // a selected tile would place instead of arming
await p.tap('#palette .swatch[data-v="1"]');
assert.equal(await brush(), '1');
const stopText = await p.$eval('#paint-stop', el => ({ hidden: el.hidden, text: el.textContent }));
assert.equal(stopText.hidden, false);
assert.match(stopText.text, /Painting Red — tap to stop/);
const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
assert.equal(overflow, false, 'paint bar overflows horizontally');
await p.screenshot({ path: `${OUT}/paint-armed.png` });
await p.tap(`#board .cell[data-i="${d}"]`);
st = await cellCol(d);
assert.equal(st.filled, true, 'paint places the armed color');
assert.match(st.col, /--c1/);
assert.equal(await brush(), '1', 'paint stays armed after a tile');
// The off switch. Previously this erased the tile (or did nothing) and left the border thick.
await p.tap('#palette .swatch[data-v="1"]');
assert.equal(await brush(), '0', 'tapping the armed color lets go');
st = await cellCol(d);
assert.equal(st.filled, true, 'letting go must not erase the tile');
assert.equal(await p.$eval('#paint-stop', el => el.hidden), true);
// Another tap on that color re-arms paint. It must not erase the tile just painted.
await p.tap('#palette .swatch[data-v="1"]');
assert.equal(await brush(), '1', 'color tap with nothing selected arms paint again');
assert.equal((await cellCol(d)).filled, true, 're-arming must not erase the tile');
await p.tap('#paint-stop');
assert.equal(await brush(), '0');
// The next tile is a selection, not another splash of that color.
await p.tap(`#board .cell[data-i="${e2}"]`);
st = await cellCol(e2);
assert.equal(st.filled, false, 'paint is off, so the next tile is not colored');
await p.keyboard.press('Escape');

// The stop bar is the other way out, including switching colors first.
await p.tap('#palette .swatch[data-v="3"]');
await p.tap('#palette .swatch[data-v="4"]');
assert.equal(await brush(), '4', 'a second color switches the brush');
await p.tap('#paint-stop');
assert.equal(await brush(), '0', 'stop bar lets go');
await p.screenshot({ path: `${OUT}/paint-off.png` });

// Ticket #6: Restart is on while playing and off once the board is solved.
assert.equal(await p.$eval('#btn-restart', el => el.disabled), false);
await p.evaluate(() => { const g = window.__prismku.G; g.grid.forEach((v, i) => { if (!g.puzzle[i]) window.__prismku.place(i, g.solution[i]); }); });
await sleep(400);
assert.equal(await p.$eval('#btn-restart', el => el.disabled), true, 'restart off after solve');
assert.equal(await p.evaluate(() => window.__prismku.G.done), true);

// A board Restart already wiped (done, but only the clues left) loads playable again.
// Mutate the live game too: pagehide persists it over localStorage on reload.
await p.evaluate(() => {
  const g = window.__prismku.G;
  g.done = true;
  g.grid = g.puzzle.slice();
  const key = 'pk.' + g.key;
  const s = JSON.parse(localStorage.getItem(key));
  s.done = true;
  s.grid = g.grid.slice();
  localStorage.setItem(key, JSON.stringify(s));
});
await p.reload({ waitUntil: 'networkidle0' });
await sleep(300);
const healed = await p.evaluate(() => ({ done: window.__prismku.G.done, restart: document.querySelector('#btn-restart').disabled }));
assert.equal(healed.done, false, 'cleared solved board loads unfinished');
assert.equal(healed.restart, false, 'restart is available again');
const playable = await empty();
await p.click(`#board .cell[data-i="${playable[0]}"]`);
await p.click('#palette .swatch[data-v="1"]');
assert.equal((await cellCol(playable[0])).filled, true, 'healed board accepts a move');

await b.close();
assert.deepEqual(errors, [], errors.join('\n'));
console.log('paint + restart tests passed');
