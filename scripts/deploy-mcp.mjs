// Generates build/deploy-code.js: a self-contained async function that deploys dist/ + the Worker via the
// Cloudflare REST API (assets upload session -> bucket uploads -> script upload). Used when wrangler/API
// tokens are unavailable (e.g. from an agent's Cloudflare connector). CI uses `wrangler deploy` instead.
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extname, join } from 'node:path';
import { build } from 'esbuild';

const DB_ID = 'db3c2c9f-c4c6-425e-9699-0ea8250505a8';
const NAME = 'rainbow-sudoku';
const TYPES = { html: 'text/html', js: 'application/javascript', css: 'text/css', json: 'application/json', webmanifest: 'application/manifest+json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', txt: 'text/plain', xml: 'application/xml', ico: 'image/x-icon' };

mkdirSync('build', { recursive: true });

const manifest = {}, files = {};
let headers = '';
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    const rel = '/' + p.slice('dist/'.length);
    if (rel === '/_headers') { headers = readFileSync(p, 'utf8'); continue; }
    const buf = readFileSync(p), b64 = buf.toString('base64'), ext = extname(p).slice(1);
    const hash = createHash('sha256').update(b64 + ext).digest('hex').slice(0, 32);
    manifest[rel] = { hash, size: buf.length };
    files[hash] = { b64, type: TYPES[ext] || 'application/octet-stream' };
  }
})('dist');
const MODE = process.env.MODE || 'embedded'; // 'embedded' (assets inside the bundle) | 'assets' (static assets service)
const amap = {}, blobs = {};
for (const [rel, m] of Object.entries(manifest)) { amap[rel] = { type: files[m.hash].type, hash: m.hash }; blobs[m.hash] = files[m.hash].b64; }
writeFileSync('build/assets-map.js', 'export const BLOBS = ' + JSON.stringify(blobs) + ';\nexport const ASSETS_MAP = ' + JSON.stringify(amap) + ';\n');
await build({ entryPoints: [MODE === 'embedded' ? 'src/embedded.js' : 'src/worker.js'], bundle: true, format: 'esm', outfile: 'build/worker.js', target: 'es2022', minify: true });
const workerCode = readFileSync('build/worker.js', 'utf8');

const assetsCode = `async () => {
  const NAME = ${JSON.stringify(NAME)};
  const manifest = ${JSON.stringify(manifest)};
  const files = ${JSON.stringify(files)};
  const workerCode = ${JSON.stringify(workerCode)};
  const headersFile = ${JSON.stringify(headers)};
  const A = '/accounts/' + accountId;
  const sess = await cloudflare.request({ method: 'POST', path: A + '/workers/scripts/' + NAME + '/assets-upload-session', body: { manifest } });
  let jwt = sess.result.jwt; const buckets = sess.result.buckets || [];
  let uploaded = 0;
  for (const bucket of buckets) {
    const form = new FormData();
    for (const h of bucket) { form.append(h, new Blob([files[h].b64], { type: files[h].type }), h); uploaded++; }
    const r = await fetch('https://api.cloudflare.com/client/v4/accounts/' + accountId + '/workers/assets/upload?base64=true', { method: 'POST', headers: { Authorization: 'Bearer ' + jwt }, body: form });
    const j = await r.json();
    if (!j.success) return { step: 'upload', status: r.status, errors: j.errors };
    if (j.result && j.result.jwt) jwt = j.result.jwt;
  }
  const salt = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
  const metadata = {
    main_module: 'worker.js', compatibility_date: '2026-10-01',
    bindings: [ { type: 'd1', name: 'DB', id: ${JSON.stringify(DB_ID)} }, { type: 'assets', name: 'ASSETS' }, { type: 'secret_text', name: 'RL_SALT', text: salt } ],
    assets: { jwt, config: { html_handling: 'auto-trailing-slash', not_found_handling: '404-page', run_worker_first: ['/api/*'], _headers: headersFile } },
    observability: { enabled: true },
  };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('worker.js', new Blob([workerCode], { type: 'application/javascript+module' }), 'worker.js');
  const up = await cloudflare.request({ method: 'PUT', path: A + '/workers/scripts/' + NAME, body: form });
  const sub = await cloudflare.request({ method: 'POST', path: A + '/workers/scripts/' + NAME + '/subdomain', body: { enabled: true, previews_enabled: false } });
  const cron = await cloudflare.request({ method: 'PUT', path: A + '/workers/scripts/' + NAME + '/schedules', body: [{ cron: '5 0 * * *' }] });
  return { files: Object.keys(manifest).length, uploaded, script: { id: up.result.id, etag: up.result.etag, modified: up.result.modified_on, assets: !!up.result.has_assets }, subdomain: sub.result, cron: cron.result };
}`;
const embeddedCode = `async () => {
  const NAME = ${JSON.stringify(NAME)};
  const workerCode = ${JSON.stringify(workerCode)};
  const A = '/accounts/' + accountId;
  const salt = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
  const metadata = {
    main_module: 'worker.js', compatibility_date: '2026-10-01',
    bindings: [ { type: 'd1', name: 'DB', id: ${JSON.stringify(DB_ID)} }, { type: 'secret_text', name: 'RL_SALT', text: salt } ],
    observability: { enabled: true },
  };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('worker.js', new Blob([workerCode], { type: 'application/javascript+module' }), 'worker.js');
  const up = await cloudflare.request({ method: 'PUT', path: A + '/workers/scripts/' + NAME, body: form });
  const sub = await cloudflare.request({ method: 'POST', path: A + '/workers/scripts/' + NAME + '/subdomain', body: { enabled: true, previews_enabled: false } });
  const cron = await cloudflare.request({ method: 'PUT', path: A + '/workers/scripts/' + NAME + '/schedules', body: [{ cron: '5 0 * * *' }] });
  return { bytes: workerCode.length, script: { id: up.result.id, etag: up.result.etag, modified: up.result.modified_on, startup_ms: up.result.startup_time_ms }, subdomain: sub.result, cron: cron.result };
}`;
const code = MODE === 'embedded' ? embeddedCode : assetsCode;
writeFileSync('build/deploy-code.js', code);
console.log(`build/deploy-code.js: ${(code.length / 1024).toFixed(0)} KB, ${Object.keys(manifest).length} files`);
