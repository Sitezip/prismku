// Daily Archive (2026-11-27): /daily/ lists every daily; a day page shows four boards and "Play this puzzle"
// opens that exact daily in the game as a replay (today's link opens the real daily).
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { dailySeed } from '../client/puzzle.js';
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const errs = []; const wait = (ms) => new Promise(r => setTimeout(r, ms));
const p = await b.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.setViewport({ width: 390, height: 844, isMobile: true });
const today = (await (await fetch(BASE + '/api/health')).json()).day;
const yday = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
await p.goto(BASE + '/daily/', { waitUntil: 'networkidle0' });
assert.match(await p.title(), /daily puzzle archive/i);
const n = await p.$$eval('.days a', as => as.length); assert.ok(n >= 2, 'days listed');
await p.click(`a[href="/daily/${yday}/"]`); await p.waitForSelector('.boards');
const info = await p.evaluate(() => ({ cards: document.querySelectorAll('.card').length, tiles: [...document.querySelectorAll('.card > .g')].map(g => g.children.length), sol: document.querySelectorAll('details').length, footer: !!document.querySelector('.site-foot a[href="/#feedback"]') }));
console.log(info); assert.deepEqual(info.tiles, [16, 25, 36, 81]); assert.equal(info.sol, 4); assert.ok(info.footer);
await p.click('details summary'); await p.screenshot({ path: '/tmp/archive-day.png', fullPage: true });
await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0' }), p.click(`a[href="/?replay=${yday}&mode=hard"]`)]);
await wait(500);
const st = await p.evaluate(() => ({ mode: window.__prismku.G.mode, play: window.__prismku.G.play, seed: window.__prismku.G.seed, replay: window.__prismku.G.replay, path: location.pathname + location.search, tip: document.querySelector('#tip').textContent }));
console.log(st);
assert.equal(st.mode, 'hard'); assert.equal(st.play, 'free'); assert.equal(st.replay, yday); assert.equal(st.seed, dailySeed(yday, 'hard'));
assert.equal(st.path, '/'); assert.match(st.tip, /Replaying Daily/);
await p.screenshot({ path: '/tmp/archive-play.png' });
// today's page: no answers, link opens the daily
await p.goto(BASE + `/daily/${today}/`, { waitUntil: 'networkidle0' });
assert.equal(await p.$$eval('details', d => d.length), 0);
await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0' }), p.click(`a[href="/?replay=${today}&mode=medium"]`)]);
await wait(500);
const st2 = await p.evaluate(() => ({ mode: window.__prismku.G.mode, play: window.__prismku.G.play }));
assert.deepEqual(st2, { mode: 'medium', play: 'daily' });
// bogus deep link is ignored; future day 404s
await p.goto(BASE + '/?replay=2099-01-01&mode=expert', { waitUntil: 'networkidle0' });
assert.notEqual(await p.evaluate(() => window.__prismku.G.replay), '2099-01-01');
assert.equal((await fetch(BASE + '/daily/2099-01-01/')).status, 404);
assert.equal((await fetch(BASE + '/daily', { redirect: 'manual' })).status, 301);
assert.deepEqual(errs, []);
await b.close();
console.log('archive ui ok');
