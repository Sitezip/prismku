// Browser + API tests (the ones `npm test` can't run: they need a server). `npm run test:e2e`
// Starts `wrangler dev` on :8787 with the local D1 (unless BASE is set), runs every test/*.test.mjs that is not
// part of `npm test`, one by one, and stops the server. ONLY=name,name runs a subset. Exit code 1 if any fail.
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
const unit = new Set([...JSON.parse(readFileSync('package.json', 'utf8')).scripts.test.matchAll(/test\/([\w-]+)\.test\.mjs/g)].map(m => m[1]));
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const tests = readdirSync('test').filter(f => f.endsWith('.test.mjs')).map(f => f.slice(0, -9)).filter(t => !unit.has(t) && (!only || only.has(t)));
let BASE = process.env.BASE, server = null;
if (!BASE) {
  BASE = 'http://127.0.0.1:8787';
  spawnSync('node', ['scripts/build.mjs'], { stdio: 'inherit' });
  spawnSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'rainbow-sudoku-db', '--local'], { stdio: 'ignore', input: 'y\n' });
  server = spawn('npx', ['wrangler', 'dev', '--port', '8787', '--ip', '127.0.0.1'], { stdio: 'ignore', detached: true });
  const until = Date.now() + 60000;
  for (;;) {
    try { if ((await fetch(BASE + '/api/health')).ok) break; } catch {}
    if (Date.now() > until) { console.error('wrangler dev did not start'); process.kill(-server.pid); process.exit(1); }
    await new Promise(r => setTimeout(r, 500));
  }
}
const failed = [];
for (const t of tests) {
  const t0 = Date.now();
  const r = spawnSync('node', [`test/${t}.test.mjs`], { env: { ...process.env, BASE, HOLD: process.env.HOLD || '3000' }, encoding: 'utf8', timeout: 180000 });
  const ok = r.status === 0; if (!ok) failed.push(t);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${t} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (!ok) console.log((r.stdout + r.stderr).split('\n').slice(-15).join('\n'));
}
if (server) try { process.kill(-server.pid); } catch {}
console.log(failed.length ? `${failed.length} failed: ${failed.join(', ')}` : `all ${tests.length} e2e tests passed`);
process.exit(failed.length ? 1 : 0);
