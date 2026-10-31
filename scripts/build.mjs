// Build dist/: current game at /, frozen releases at /v/<day>/, /versions/ index, sitemap.
import { cpSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
const SITE = 'https://prismku.com';
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('client', 'dist', { recursive: true });
const releases = existsSync('releases') ? readdirSync('releases').filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse() : [];
const meta = releases.map(d => JSON.parse(readFileSync(`releases/${d}/RELEASE.json`, 'utf8')));
for (const d of releases) cpSync(`releases/${d}`, `dist/v/${d}`, { recursive: true, filter: s => !s.endsWith('RELEASE.json') });
writeFileSync('dist/versions.json', JSON.stringify(meta, null, 2));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
mkdirSync('dist/versions', { recursive: true });
writeFileSync('dist/versions/index.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Prismku version history — every edition of Rainbow Sudoku</title><meta name="description" content="Play every past edition of Prismku, the Rainbow Sudoku color puzzle, as it evolves day by day.">
<link rel="canonical" href="${SITE}/versions/"><link rel="icon" href="/img/favicon.svg"><meta property="og:image" content="${SITE}/img/og.png">
<style>body{margin:0;background:#120b2e;color:#f6f1ff;font:16px/1.5 system-ui,sans-serif}main{max-width:680px;margin:0 auto;padding:24px 16px}a{color:#ffd60a}
h1{background:linear-gradient(90deg,#ff3b47,#ff8c1a,#ffd60a,#2ecc71,#2f7bff,#9b5cff);-webkit-background-clip:text;color:transparent}
.card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:14px 16px;margin:12px 0}.card h2{margin:0 0 4px;font-size:18px}.tag{font-size:12px;background:#2ecc71;color:#062;border-radius:999px;padding:1px 8px;margin-left:6px}</style></head>
<body><main><h1>Prismku version history</h1><p>Prismku evolves every day. Each edition is frozen and still playable here. <a href="/">← Play the latest</a></p>
${meta.map((m, i) => `<div class="card"><h2><a href="/v/${m.day}/">${esc(m.day)} — ${esc(m.title)}</a>${i === 0 ? '<span class="tag">latest</span>' : ''}</h2><ul>${m.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>`).join('\n')}
</main></body></html>`);
writeFileSync('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${SITE}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>\n<url><loc>${SITE}/versions/</loc><changefreq>daily</changefreq></url>\n${releases.map(d => `<url><loc>${SITE}/v/${d}/</loc></url>`).join('\n')}\n</urlset>\n`);
console.log(`built dist/ with ${releases.length} release(s): ${releases.join(', ')}`);
