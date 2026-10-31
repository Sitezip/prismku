// Freeze the current client as a historical, playable snapshot: node scripts/release.mjs [YYYY-MM-DD] "Title" "note1|note2"
import { cpSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
const day = process.argv[2] || new Date().toISOString().slice(0, 10);
const title = process.argv[3] || `Release ${day}`;
const notes = (process.argv[4] || '').split('|').filter(Boolean);
const dest = `releases/${day}`;
const cfg = readFileSync('client/config.js', 'utf8');
if (!cfg.includes(`version: '${day}'`)) { console.error(`client/config.js version must be '${day}' before freezing`); process.exit(1); }
if (existsSync(dest)) console.warn(`overwriting ${dest}`);
mkdirSync(dest, { recursive: true });
cpSync('client', dest, { recursive: true, filter: (src) => !/(sw\.js|_headers|_redirects|robots\.txt|sitemap\.xml)$/.test(src) });
writeFileSync(`${dest}/RELEASE.json`, JSON.stringify({ day, title, notes, frozenAt: new Date().toISOString() }, null, 2));
console.log(`frozen ${dest}`);
