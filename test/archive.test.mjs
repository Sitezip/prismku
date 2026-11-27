// Daily Archive (2026-11-27): /daily/ pages and ?replay= deep links. Pure helpers + server rendering.
import assert from 'node:assert/strict';
import { validDay, inArchive, archiveDays, parseArchivePath, replayFromSearch, dayBoards, archivePlayHref, addDay, longDate } from '../client/archive.js';
import { dayPage, indexPage, sitemap, boardHTML, archiveResponse } from '../src/archive.js';
import { generate, dailySeed, isSolved, MODE_KEYS } from '../client/puzzle.js';
import { LINKS } from '../scripts/site-footer.mjs';
import { readFileSync } from 'node:fs';

const L = '2026-10-31', T = '2026-11-27';
const dayNumber = d => Math.round((Date.parse(d) - Date.parse(L)) / 86400000) + 1;
const ctx = { launch: L, today: T, dayNumber };

// dates
assert.ok(validDay('2026-11-27')); assert.ok(validDay('2028-02-29'));
for (const bad of ['2026-02-30', '2026-13-01', '2026-1-01', '', null, '2026-11-27x', '../etc']) assert.equal(validDay(bad), false, String(bad));
assert.equal(addDay('2026-11-30', 1), '2026-12-01'); assert.equal(addDay('2027-01-01', -1), '2026-12-31');
assert.ok(inArchive(L, L, T) && inArchive(T, L, T)); assert.ok(!inArchive('2026-10-30', L, T) && !inArchive('2026-11-28', L, T));
const days = archiveDays(L, T);
assert.equal(days.length, 28); assert.equal(days[0], T); assert.equal(days.at(-1), L);
assert.equal(longDate('2026-11-27'), 'Friday, November 27, 2026');

// paths
assert.deepEqual(parseArchivePath('/daily'), { kind: 'redirect', to: '/daily/' });
assert.deepEqual(parseArchivePath('/daily/'), { kind: 'index' });
assert.deepEqual(parseArchivePath('/daily/sitemap.xml'), { kind: 'sitemap' });
assert.deepEqual(parseArchivePath('/daily/2026-11-20/'), { kind: 'day', day: '2026-11-20' });
assert.deepEqual(parseArchivePath('/daily/2026-11-20'), { kind: 'redirect', to: '/daily/2026-11-20/' });
for (const p of ['/daily/2026-02-30/', '/daily/x/', '/daily/2026-11-20/extra', '/dailyx']) assert.equal(parseArchivePath(p), null, p);

// deep link: only launch..today, mode falls back to easy
assert.equal(archivePlayHref('2026-11-20', 'hard'), '/?replay=2026-11-20&mode=hard');
assert.deepEqual(replayFromSearch('?replay=2026-11-20&mode=hard', L, T), { day: '2026-11-20', mode: 'hard', today: false });
assert.deepEqual(replayFromSearch('?replay=2026-11-27&mode=nope', L, T), { day: T, mode: 'easy', today: true });
for (const q of ['', '?replay=2026-11-28', '?replay=2026-10-30', '?replay=<script>', '?mode=hard']) assert.equal(replayFromSearch(q, L, T), null, q);

// boards are exactly the game's dailies
const boards = dayBoards('2026-11-20');
assert.deepEqual(boards.map(b => b.mode), MODE_KEYS);
for (const b of boards) {
  const g = generate(b.mode, dailySeed('2026-11-20', b.mode));
  assert.deepEqual(b.puzzle, g.puzzle); assert.deepEqual(b.solution, g.solution);
  assert.ok(isSolved(b.solution, b.puzzle, b.mode)); assert.equal(b.empty, b.puzzle.filter(v => !v).length);
}

// board markup: n*n tiles, box lines, answer tiles marked
const easy = boards[0], html = boardHTML(easy.solution, 4, [2, 2], easy.puzzle);
assert.equal((html.match(/<i/g) || []).length, 16);
assert.equal((html.match(/class="[^"]*\ba\b/g) || []).length, easy.empty);
assert.equal((boardHTML(easy.puzzle, 4, [2, 2]).match(/<svg/g) || []).length, 16 - easy.empty);

// past day page: four boards, play links, solutions, prev/next, canonical
const past = dayPage('2026-11-20', ctx);
assert.match(past, /<title>Prismku #21 — Rainbow Sudoku daily puzzle for Friday, November 20, 2026<\/title>/);
assert.match(past, /<link rel="canonical" href="https:\/\/prismku.com\/daily\/2026-11-20\/">/);
for (const m of MODE_KEYS) assert.ok(past.includes(`href="/?replay=2026-11-20&mode=${m}"`), m);
assert.equal((past.match(/Show the solution/g) || []).length, 4);
assert.ok(past.includes('href="/daily/2026-11-19/"') && past.includes('href="/daily/2026-11-21/"'));
assert.ok(past.includes('href="/#feedback"'), 'site footer');
assert.ok(past.includes('"@type":"BreadcrumbList"'));
// today: no answers, no next link
const today = dayPage(T, ctx);
assert.ok(!today.includes('Show the solution') && today.includes('answer appears here tomorrow'));
assert.ok(!today.includes('rel="next"') && today.includes('Play today’s daily'));
// launch day: no prev link
assert.ok(!dayPage(L, ctx).includes('rel="prev"'));
// index + sitemap
const idx = indexPage(ctx);
assert.equal((idx.match(/href="\/daily\/\d{4}-\d{2}-\d{2}\/"/g) || []).length, 28);
assert.ok(idx.includes('November 2026') && idx.includes('October 2026') && idx.includes('#28 · today'));
const sm = sitemap(ctx);
assert.equal((sm.match(/<loc>/g) || []).length, 29); assert.ok(sm.startsWith('<?xml'));

// Worker responses
const env = { ASSETS: { fetch: async () => new Response('<h1>404</h1>', { status: 404, headers: { 'content-type': 'text/html' } }) } };
const get = (p) => { const url = new URL('https://prismku.com' + p); return archiveResponse(new Request(url), env, url, ctx); };
let r = await get('/daily/2026-11-20/'); assert.equal(r.status, 200); assert.match(r.headers.get('cache-control'), /max-age=86400/);
r = await get('/daily/2026-11-27/'); assert.equal(r.status, 200); assert.match(r.headers.get('cache-control'), /max-age=600/);
r = await get('/daily/2026-11-28/'); assert.equal(r.status, 404, 'future day');
r = await get('/daily/2026-10-30/'); assert.equal(r.status, 404, 'before launch');
r = await get('/daily/nope/'); assert.equal(r.status, 404);
r = await get('/daily'); assert.equal(r.status, 301); assert.equal(r.headers.get('location'), 'https://prismku.com/daily/');
r = await get('/daily/sitemap.xml'); assert.match(r.headers.get('content-type'), /xml/);

// wiring
assert.ok(LINKS.some(([h]) => h === '/daily/'), 'footer links the archive');
assert.match(readFileSync('wrangler.toml', 'utf8'), /"\/daily\/\*"/);
assert.match(readFileSync('client/robots.txt', 'utf8'), /daily\/sitemap\.xml/);
assert.match(readFileSync('client/sw.js', 'utf8'), /'\/archive\.js'/);
// speed: all four boards for a day render fast enough for a Worker (warm)
let t = performance.now(); for (let k = 1; k <= 20; k++) dayPage(addDay(L, k), ctx); const per = (performance.now() - t) / 20;
console.log(`dayPage ${per.toFixed(2)} ms`); assert.ok(per < 15);
console.log('archive tests ok');
