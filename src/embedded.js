// Alternate entry: serves dist/ from an in-bundle asset map (used for API-only deploys without the
// assets upload service). Mirrors the static-assets config: auto-trailing-slash, 404-page, _headers.
import worker from './worker.js';
import { ASSETS_MAP, BLOBS } from '../build/assets-map.js';

const decoded = new Map();
function bytes(p) {
  if (!decoded.has(p)) { const bin = atob(BLOBS[ASSETS_MAP[p].hash]); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); decoded.set(p, u); }
  return decoded.get(p);
}
function cacheFor(p) {
  if (p.startsWith('/img/')) return 'public, max-age=604800';
  if (p === '/sw.js') return 'no-cache';
  if (p.startsWith('/v/') && !p.endsWith('.html')) return 'public, max-age=86400';
  return 'public, max-age=0, must-revalidate';
}
function serve(request, p, status = 200) {
  const a = ASSETS_MAP[p];
  const h = { 'content-type': a.type, 'cache-control': cacheFor(p), etag: `"${a.hash}"`, 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' };
  if (status === 200 && request.headers.get('if-none-match') === `"${a.hash}"`) return new Response(null, { status: 304, headers: h });
  return new Response(request.method === 'HEAD' ? null : bytes(p), { status, headers: h });
}
const ASSETS = {
  async fetch(request) {
    const url = new URL(request.url);
    let p = decodeURIComponent(url.pathname);
    if (ASSETS_MAP[p] && !p.endsWith('/index.html')) return serve(request, p);
    if (p.endsWith('/index.html')) return Response.redirect(new URL(p.slice(0, -10), url).toString(), 307);
    if (p.endsWith('/') && ASSETS_MAP[p + 'index.html']) return serve(request, p + 'index.html');
    if (!p.endsWith('/') && ASSETS_MAP[p + '/index.html']) { url.pathname = p + '/'; return Response.redirect(url.toString(), 307); }
    if (!p.endsWith('/') && ASSETS_MAP[p + '.html']) return serve(request, p + '.html');
    return serve(request, '/404.html', 404);
  },
};
export default {
  fetch: (request, env, ctx) => worker.fetch(request, { ...env, ASSETS }, ctx),
  scheduled: (event, env, ctx) => worker.scheduled(event, env, ctx),
};
