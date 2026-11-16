// Dare (2026-11-16): a free-play solve shares /c/<code>; opening it loads the same board with a time to beat.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
await b.defaultBrowserContext().overridePermissions(BASE, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
const errs = []; const wait = (ms) => new Promise(r => setTimeout(r, ms));
const solve = (p) => p.evaluate(() => { const g = window.__prismku.G; g.grid.forEach((v, i) => { if (!g.puzzle[i] && !v) window.__prismku.place(i, g.solution[i]); }); });
// Player A: free play Hard, solve, copy the dare link
const a = await b.newPage(); a.on('pageerror', e => errs.push(e.message)); await a.setViewport({ width: 1200, height: 900 });
await a.goto(BASE + '/', { waitUntil: 'networkidle0' }); await a.evaluate(() => document.querySelector('#dlg').close());
await a.click('[data-play="free"]'); await a.click('[data-mode="hard"]'); await wait(1300);
const seedA = await a.evaluate(() => window.__prismku.G.seed);
await solve(a); await wait(1500);
assert.ok(await a.$('#dlg [data-act="dare"]'), 'dare button on free-play win');
const share = await a.evaluate(() => window.__prismku.shareText());
assert.match(share, /prismku\.com\/c\/h[0-9a-z]+-[0-9a-z]+/);
await a.click('#dlg [data-act="dare"]'); await wait(400);
const clip = await a.evaluate(() => navigator.clipboard.readText());
console.log({ share, clip }); assert.match(clip, /Can you beat \d+:\d\d on this Prismku Hard 6×6\?/);
const link = clip.match(/https:\/\/prismku\.com(\/c\/[0-9a-z-]+)/)[1];
// Player B (fresh profile): open the link
const ctxB = await b.createBrowserContext(); const p = await ctxB.newPage(); p.on('pageerror', e => errs.push(e.message));
await p.setViewport({ width: 360, height: 740, isMobile: true });
await p.goto(BASE + link, { waitUntil: 'networkidle0' });
const og = await p.evaluate(() => document.querySelector('meta[property="og:title"]').content);
assert.match(og, /Can you beat/);
await p.evaluate(() => document.querySelector('#dlg').open && document.querySelector('#dlg').close()); await wait(300);
const st = await p.evaluate(() => ({ seed: window.__prismku.G.seed, mode: window.__prismku.G.mode, play: window.__prismku.G.play, ch: window.__prismku.G.challenge, practice: !!window.__prismku.G.practice, tip: document.querySelector('#tip').textContent, path: location.pathname, css: getComputedStyle(document.querySelector('.cell')).borderRadius }));
console.log(st);
assert.equal(st.seed, seedA); assert.equal(st.mode, 'hard'); assert.equal(st.play, 'free'); assert.ok(st.ch.ms > 0); assert.equal(st.practice, false);
assert.match(st.tip, /Challenge board/); assert.equal(st.path, '/');
await p.screenshot({ path: '/tmp/dare-open.png' });
await solve(p); await wait(1600);
const v = await p.evaluate(() => document.querySelector('.dare-verdict')?.textContent);
console.log('verdict', v); assert.match(v, /beat their|holds|Dead heat/);
assert.match(await p.evaluate(() => window.__prismku.shareText()), /⚔️ Challenge: beat \d+:\d\d/);
await p.screenshot({ path: '/tmp/dare-win.png' });
// Player A opening their own link keeps the solved board (no fake race against themself)
await a.goto(BASE + link, { waitUntil: 'networkidle0' });
const own = await a.evaluate(() => ({ done: window.__prismku.G.done, ch: window.__prismku.G.challenge || null }));
assert.ok(own.done); assert.equal(own.ch, null);
// After A starts a new board, the old one counts as seen: opening the link is practice
await a.evaluate(() => document.querySelector('#dlg').open && document.querySelector('#dlg').close());
await a.click('#btn-new'); await wait(800);
await a.goto(BASE + link, { waitUntil: 'networkidle0' });
assert.equal(await a.evaluate(() => window.__prismku.G.practice), true);
// Bad codes fall back to the normal game
const ctxC = await b.createBrowserContext(); const q = await ctxC.newPage(); q.on('pageerror', e => errs.push(e.message));
await q.goto(BASE + '/?c=zzz', { waitUntil: 'networkidle0' }); assert.ok(await q.evaluate(() => !window.__prismku.G.challenge && window.__prismku.G.play === 'daily'));
const r404 = await fetch(BASE + '/c/nope!!'); assert.equal(new URL(r404.url).pathname, '/');
assert.deepEqual(errs, []); await b.close(); console.log('challenge ui ok');
