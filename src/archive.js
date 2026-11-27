// /daily/ archive pages (2026-11-27 "Daily Archive"): server-rendered, indexable pages for every daily puzzle,
// rebuilt from the deterministic seed (no D1 reads). Today's page shows the boards but keeps the answers hidden.
import { archiveDays, archivePlayHref, dayBoards, longDate, inArchive, addDay, parseArchivePath } from '../client/archive.js';
import { SITE_FOOTER } from '../scripts/site-footer.mjs';

const SITE = 'https://prismku.com';
const SYM = ['',
  '<circle cx="12" cy="12" r="9"/>', '<rect x="4" y="4" width="16" height="16" rx="2"/>', '<path d="M12 3 22 20H2z"/>',
  '<path d="M12 2 22 12 12 22 2 12z"/>', '<path d="m12 2 2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.1-.6z"/>',
  '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>', '<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/>',
  '<path d="M7 3h10l5 9-5 9H7l-5-9z"/>', '<path d="M15 3a9 9 0 1 0 6 15A7 7 0 0 1 15 3z"/>'];
const NAMES = ['', 'Red', 'Blue', 'Yellow', 'Green', 'Cream', 'Orange', 'Purple', 'Pink', 'Teal'];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// One board as a CSS grid. `given` marks the starting tiles; answer tiles (solution view) are drawn softer.
export function boardHTML(cells, size, box, given = null, label = '') {
  const [bh, bw] = box || [0, 0];
  return `<div class="g" style="grid-template-columns:repeat(${size},1fr)" role="img" aria-label="${esc(label || `${size} by ${size} board`)}">${cells.map((v, i) => {
    const r = Math.floor(i / size), c = i % size;
    const cls = [v ? 'f' : '', given && v && !given[i] ? 'a' : '', c < size - 1 && bw && (c + 1) % bw === 0 ? 'br' : '', r < size - 1 && bh && (r + 1) % bh === 0 ? 'bb' : ''].filter(Boolean).join(' ');
    return `<i${cls ? ` class="${cls}"` : ''}${v ? ` style="--col:var(--c${v})" title="${NAMES[v]}"><svg viewBox="0 0 24 24" aria-hidden="true">${SYM[v]}</svg></i>` : '></i>'}`;
  }).join('')}</div>`;
}

const STYLE = `:root{--c1:#ff3b47;--c2:#2f7bff;--c3:#ffd60a;--c4:#2ecc71;--c5:#fff1d0;--c6:#ff8c1a;--c7:#9b5cff;--c8:#ff5cc8;--c9:#19d3c5}
body{margin:0;background:#120b2e;color:#f6f1ff;font:16px/1.55 system-ui,sans-serif}main{max-width:900px;margin:0 auto;padding:22px 16px 10px}a{color:#ffd60a}
h1{background:linear-gradient(90deg,#ff3b47,#ff8c1a,#ffd60a,#2ecc71,#2f7bff,#9b5cff);-webkit-background-clip:text;background-clip:text;color:transparent;line-height:1.2;margin:.2em 0 .3em}
.crumb{font-size:14px;color:#b9aedb}.lead{color:#ddd3ff}.nav{display:flex;justify-content:space-between;gap:10px;margin:14px 0;font-size:15px}
.boards{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px}
.card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:14px}.card h2{margin:0 0 2px;font-size:18px}.card .sub{margin:0 0 10px;font-size:13.5px;color:#b9aedb}
.g{display:grid;aspect-ratio:1;border:3px solid #e8e0ff;border-radius:6px;overflow:hidden;background:#1c1442}.g i{display:flex;align-items:center;justify-content:center;border-right:1px solid rgba(255,255,255,.18);border-bottom:1px solid rgba(255,255,255,.18)}
.g i:nth-child(n){min-width:0}.g i.br{border-right:3px solid #e8e0ff}.g i.bb{border-bottom:3px solid #e8e0ff}.g i svg{width:58%;height:58%;fill:rgba(0,0,0,.25);stroke:rgba(0,0,0,.55);stroke-width:1.2}
.g i.f{background:var(--col)}.g i.a{background:color-mix(in srgb,var(--col) 55%,#1c1442)}
.play{display:inline-block;margin-top:10px;background:linear-gradient(90deg,#ff3b47,#9b5cff);color:#fff;text-decoration:none;font-weight:700;border-radius:999px;padding:7px 16px}
details{margin-top:10px}summary{cursor:pointer;color:#ffd60a}.lock{margin-top:10px;font-size:13.5px;color:#b9aedb}
.days{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.days a{display:block;text-decoration:none;color:#f6f1ff;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:10px 12px}
.days a b{display:block;color:#ffd60a}.days a small{color:#b9aedb}.days a.today{border-color:#2ecc71}h2.month{font-size:18px;margin:22px 0 10px}`;

function page({ title, desc, path, body, jsonld }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${SITE}${path}"><link rel="icon" href="/img/favicon.svg">
<meta property="og:type" content="website"><meta property="og:site_name" content="Prismku"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${SITE}/img/og.png"><meta property="og:url" content="${SITE}${path}"><meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>
<style>${STYLE}</style></head><body><main>${body}</main>${SITE_FOOTER}</body></html>`;
}

const crumbs = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + path })) });

export function dayPage(day, ctx) {
  const { launch, today, dayNumber } = ctx;
  const n = dayNumber(day), isToday = day === today, date = longDate(day);
  const boards = dayBoards(day);
  const prev = day > launch ? addDay(day, -1) : null, next = day < today ? addDay(day, 1) : null;
  const title = `Prismku #${n} — Rainbow Sudoku daily puzzle for ${date}`;
  const desc = `Daily color sudoku #${n} (${date}): four Rainbow Sudoku boards from Easy 4×4 to Expert 9×9, each with exactly one solution. ${isToday ? 'Play today’s puzzle free in your browser.' : 'Play it free in your browser, or check the answers.'}`;
  const cards = boards.map(b => {
    const name = `${b.label} ${b.size}×${b.size}`;
    return `<section class="card"><h2>${name}</h2><p class="sub">${b.puzzle.length - b.empty} starting tiles · ${b.empty} to fill · ${b.size} colors</p>
${boardHTML(b.puzzle, b.size, b.box, null, `Prismku #${n} ${name} puzzle`)}
<a class="play" href="${archivePlayHref(day, b.mode)}">▶ ${isToday ? 'Play today’s daily' : 'Play this puzzle'}</a>
${isToday ? '<p class="lock">🔒 The answer appears here tomorrow, after this daily closes.</p>'
    : `<details><summary>Show the solution</summary>${boardHTML(b.solution, b.size, b.box, b.puzzle, `Prismku #${n} ${name} solution`)}</details>`}</section>`;
  }).join('\n');
  const body = `<p class="crumb"><a href="/">Prismku</a> › <a href="/daily/">Daily archive</a> › #${n}</p>
<h1>Prismku #${n} · ${esc(date)}</h1>
<p class="lead">${isToday ? 'Today’s' : 'The'} Rainbow Sudoku daily: fill every empty tile so <b>no color repeats in any row, column or bold box</b>. Every tile also carries a symbol for colorblind players. ${isToday ? 'Today’s daily counts for streaks and the daily leaderboard.' : 'Replays are practice runs with free-play scoring; they don’t change your streak.'} New to it? <a href="/how-to-play/">How to play</a>.</p>
<nav class="nav">${prev ? `<a href="/daily/${prev}/" rel="prev">← #${n - 1}</a>` : '<span></span>'}<a href="/daily/">All dailies</a>${next ? `<a href="/daily/${next}/" rel="next">#${n + 1} →</a>` : '<span></span>'}</nav>
<div class="boards">${cards}</div>
<p class="lead" style="margin-top:18px">Prefer paper? <a href="/printable/">Print free Rainbow Sudoku worksheets</a>. Want a fast one? Try <a href="/quick-draw/">Quick Draw</a>.</p>`;
  return page({ title, desc, path: `/daily/${day}/`, body, jsonld: crumbs([['Prismku', '/'], ['Daily archive', '/daily/'], [`#${n}`, `/daily/${day}/`]]) });
}

export function indexPage(ctx) {
  const { launch, today, dayNumber } = ctx;
  const days = archiveDays(launch, today);
  let html = '', month = '';
  for (const d of days) {
    const mo = new Date(Date.parse(d)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    if (mo !== month) { html += `${month ? '</div>' : ''}<h2 class="month">${mo}</h2><div class="days">`; month = mo; }
    const wd = new Date(Date.parse(d)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
    html += `<a href="/daily/${d}/"${d === today ? ' class="today"' : ''}><b>#${dayNumber(d)}${d === today ? ' · today' : ''}</b><small>${wd}</small></a>`;
  }
  html += '</div>';
  const title = 'Prismku daily puzzle archive — every Rainbow Sudoku daily';
  const desc = `All ${days.length} Prismku daily color sudoku puzzles since ${longDate(launch)}: replay any day in Easy, Medium, Hard and Expert, or check the answers.`;
  const body = `<p class="crumb"><a href="/">Prismku</a> › Daily archive</p><h1>Daily puzzle archive</h1>
<p class="lead">A new Rainbow Sudoku daily lands every day at 00:00 UTC, in four sizes. Missed one? Open any day to see its boards, play it again, or peek at the solution. <a href="/">Play today’s daily →</a></p>${html}`;
  return page({ title, desc, path: '/daily/', body, jsonld: crumbs([['Prismku', '/'], ['Daily archive', '/daily/']]) });
}

export function sitemap(ctx) {
  const days = archiveDays(ctx.launch, ctx.today);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${SITE}/daily/</loc><changefreq>daily</changefreq><priority>0.8</priority></url>\n${days.map(d => `<url><loc>${SITE}/daily/${d}/</loc>${d === ctx.today ? '<changefreq>daily</changefreq>' : ''}</url>`).join('\n')}\n</urlset>\n`;
}

// Worker entry for /daily and /daily/*. Returns a Response; unknown or future days get the site 404 page.
export async function archiveResponse(request, env, url, ctx) {
  const r = parseArchivePath(url.pathname);
  const notFound = () => env.ASSETS.fetch(new Request(new URL('/__no-such-daily__', url).toString())).then(res => new Response(res.body, { status: 404, headers: res.headers }));
  if (!r) return notFound();
  if (r.kind === 'redirect') return Response.redirect(new URL(r.to + url.search, url).toString(), 301);
  const head = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' };
  if (r.kind === 'sitemap') return new Response(sitemap(ctx), { headers: { ...head, 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
  const html = { ...head, 'content-type': 'text/html; charset=utf-8' };
  if (r.kind === 'index') return new Response(indexPage(ctx), { headers: { ...html, 'cache-control': 'public, max-age=600' } });
  if (!inArchive(r.day, ctx.launch, ctx.today)) return notFound();
  return new Response(dayPage(r.day, ctx), { headers: { ...html, 'cache-control': r.day === ctx.today ? 'public, max-age=600' : 'public, max-age=86400' } });
}
