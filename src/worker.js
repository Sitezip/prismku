// Prismku (Rainbow Sudoku) — Cloudflare Worker: JSON API on D1 + static SPA assets.
import { MODES, generate, isSolved, stringToGrid, gridToString, dailySeed, computeScore } from '../client/puzzle.js';

const LAUNCH_DAY = '2026-10-31';
const NICK_RE = /^[A-Za-z0-9 _.\-]{2,16}$/;
const BLOCKED = ['fuck', 'shit', 'cunt', 'nigg', 'fag', 'bitch', 'whore', 'slut', 'rape', 'nazi', 'dick', 'cock', 'pussy', 'porn', 'sex'];
const ACH = {
  first_solve: 'First Prism — solved a first puzzle',
  daily_solver: 'Daily Glow — solved a daily puzzle',
  expert_solve: 'Full Spectrum — solved an Expert 9×9',
  flawless: 'Flawless Hue — Hard or Expert with no hints and no mistakes',
  speed_easy: 'Flash — Easy in under 10 seconds',
  speed_hard: 'Lightspeed — Hard in under 60 seconds',
  ten_games: 'Color Habit — 10 puzzles solved',
  fifty_games: 'Prism Master — 50 puzzles solved',
  streak_3: 'Hat Trick — 3-day daily streak',
  streak_7: 'Rainbow Week — 7-day daily streak',
  daily_top: 'Brightest Today — #1 on a daily leaderboard',
};

const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra },
});
const err = (msg, status = 400) => json({ ok: false, error: msg }, status);

export const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export const dayNumber = (day) => Math.round((Date.parse(day) - Date.parse(LAUNCH_DAY)) / 86400000) + 1;

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function rateLimit(env, request, action, max) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const iph = (await sha256(`${ip}|${env.RL_SALT || 'prismku'}|${utcDay()}`)).slice(0, 24);
  const window = Math.floor(Date.now() / 60000);
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, window, count) VALUES (?1, ?2, 1)
     ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count`
  ).bind(`${iph}:${action}:${window}`, window).first();
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM rate_limits WHERE window < ?').bind(window - 5).run();
  return row.count <= max;
}

async function readJson(request) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > 4096) throw new Error('body too large');
  const text = await request.text();
  if (text.length > 4096) throw new Error('body too large');
  return JSON.parse(text);
}

function cleanNick(n) {
  if (typeof n !== 'string') return null;
  n = n.trim().replace(/\s+/g, ' ');
  if (!NICK_RE.test(n)) return null;
  const low = n.toLowerCase().replace(/[^a-z]/g, '');
  if (BLOCKED.some(b => low.includes(b))) return null;
  return n;
}
const validId = (id) => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);
const validSecret = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(s);

async function ensureDaily(env, day, mode) {
  const id = `${day}:${mode}`;
  let row = await env.DB.prepare('SELECT * FROM daily_puzzles WHERE id = ?').bind(id).first();
  if (!row) {
    const seed = dailySeed(day, mode);
    const p = generate(mode, seed);
    await env.DB.prepare('INSERT OR IGNORE INTO daily_puzzles (id, day, mode, size, seed, puzzle, number, created_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(id, day, mode, p.size, seed, gridToString(p.puzzle), dayNumber(day), Date.now()).run();
    row = { id, day, mode, size: p.size, seed, puzzle: gridToString(p.puzzle), number: dayNumber(day) };
  }
  return row;
}

async function auth(env, id, secret) {
  if (!validId(id) || !validSecret(secret)) return null;
  const p = await env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(id).first();
  if (!p || p.secret_hash !== await sha256(secret)) return null;
  return p;
}

async function upsertPlayer(env, request) {
  if (!await rateLimit(env, request, 'player', 8)) return err('slow down', 429);
  const b = await readJson(request);
  if (!validId(b.id) || !validSecret(b.secret)) return err('bad id');
  const nick = cleanNick(b.nickname);
  if (!nick) return err('Nickname must be 2–16 letters/numbers and family friendly');
  const now = Date.now();
  const existing = await env.DB.prepare('SELECT secret_hash FROM players WHERE id = ?').bind(b.id).first();
  const sh = await sha256(b.secret);
  if (existing) {
    if (existing.secret_hash !== sh) return err('not your player', 403);
    await env.DB.prepare('UPDATE players SET nickname = ?, last_seen = ? WHERE id = ?').bind(nick, now, b.id).run();
  } else {
    await env.DB.prepare('INSERT INTO players (id, secret_hash, nickname, created_at, last_seen) VALUES (?,?,?,?,?)').bind(b.id, sh, nick, now, now).run();
    await bump(env, ['players_total']);
  }
  return json({ ok: true, nickname: nick });
}

async function bump(env, keys) {
  const stmt = env.DB.prepare('INSERT INTO community_stats (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1');
  await env.DB.batch(keys.map(k => stmt.bind(k)));
}

function streakFrom(days) {
  // days: sorted desc unique YYYY-MM-DD with a daily solve
  if (!days.length) return 0;
  let streak = 1;
  for (let i = 1; i < days.length; i++) {
    if (Date.parse(days[i - 1]) - Date.parse(days[i]) === 86400000) streak++; else break;
  }
  const gap = Date.parse(utcDay()) - Date.parse(days[0]);
  return gap <= 86400000 ? streak : 0;
}

async function submitScore(env, request) {
  if (!await rateLimit(env, request, 'score', 15)) return err('slow down', 429);
  const b = await readJson(request);
  const player = await auth(env, b.playerId, b.secret);
  if (!player) return err('unknown player — set a nickname first', 401);
  const mode = MODES[b.mode];
  if (!mode) return err('bad mode');
  const seed = Number(b.seed);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return err('bad seed');
  let dailyId = null;
  if (b.daily) {
    const day = String(b.day || '');
    const today = utcDay(), yesterday = utcDay(Date.now() - 86400000);
    if (day !== today && day !== yesterday) return err('daily puzzle expired');
    if (dailySeed(day, b.mode) !== seed) return err('seed does not match daily');
    dailyId = `${day}:${b.mode}`;
    await ensureDaily(env, day, b.mode);
  }
  if (typeof b.grid !== 'string' || b.grid.length !== mode.size * mode.size) return err('bad grid');
  const grid = stringToGrid(b.grid);
  const { puzzle } = generate(b.mode, seed);
  if (!isSolved(grid, puzzle, b.mode)) return err('grid is not a valid solution');
  const empty = puzzle.filter(v => !v).length;
  const timeMs = Math.round(Number(b.timeMs)), moves = Math.round(Number(b.moves));
  const hints = Math.round(Number(b.hints) || 0), mistakes = Math.round(Number(b.mistakes) || 0);
  if (!(timeMs >= mode.minMs && timeMs <= 6 * 3600 * 1000)) return err('time out of range');
  if (!(moves >= empty - hints && moves <= 5000)) return err('moves out of range');
  if (!(hints >= 0 && hints <= empty) || !(mistakes >= 0 && mistakes <= 2000)) return err('stats out of range');
  const version = String(b.version || 'unknown').slice(0, 20);
  const score = computeScore(b.mode, timeMs, hints, mistakes);
  const now = Date.now(), day = utcDay();

  let ins;
  try {
    ins = await env.DB.prepare(`INSERT INTO scores (player_id, mode, size, seed, daily_id, time_ms, moves, hints, mistakes, score, version, day, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`).bind(player.id, b.mode, mode.size, seed, dailyId, timeMs, moves, hints, mistakes, score, version, day, now).first();
  } catch (e) {
    if (String(e).includes('UNIQUE')) return err('daily already submitted', 409);
    throw e;
  }
  await env.DB.prepare('UPDATE players SET games = games + 1, last_seen = ? WHERE id = ?').bind(now, player.id).run();
  await bump(env, ['games_total', `games_${b.mode}`, `games_day_${day}`, ...(dailyId ? ['daily_total'] : []), ...(hints ? ['hints_total'] : [])]);

  // Achievements
  const games = player.games + 1;
  const earned = [];
  const want = (cond, code) => { if (cond) earned.push(code); };
  want(true, 'first_solve');
  want(!!dailyId, 'daily_solver');
  want(b.mode === 'expert', 'expert_solve');
  want((b.mode === 'hard' || b.mode === 'expert') && !hints && !mistakes, 'flawless');
  want(b.mode === 'easy' && timeMs < 10000 && !hints, 'speed_easy');
  want(b.mode === 'hard' && timeMs < 60000 && !hints, 'speed_hard');
  want(games >= 10, 'ten_games');
  want(games >= 50, 'fifty_games');
  let streak = 0;
  if (dailyId) {
    const rows = await env.DB.prepare('SELECT DISTINCT substr(daily_id,1,10) d FROM scores WHERE player_id = ? AND daily_id IS NOT NULL ORDER BY d DESC LIMIT 60').bind(player.id).all();
    streak = streakFrom(rows.results.map(r => r.d));
    want(streak >= 3, 'streak_3');
    want(streak >= 7, 'streak_7');
    if (streak > player.best_streak) await env.DB.prepare('UPDATE players SET best_streak = ? WHERE id = ?').bind(streak, player.id).run();
  }
  let dailyRank = null;
  if (dailyId) {
    const r = await env.DB.prepare('SELECT COUNT(*) c FROM scores WHERE daily_id = ? AND score > ?').bind(dailyId, score).first();
    dailyRank = r.c + 1;
    want(dailyRank === 1, 'daily_top');
  }
  const newly = [];
  if (earned.length) {
    const stmt = env.DB.prepare('INSERT OR IGNORE INTO achievements (player_id, code, earned_at, score_id) VALUES (?,?,?,?)');
    const res = await env.DB.batch(earned.map(c => stmt.bind(player.id, c, now, ins.id)));
    res.forEach((r, i) => { if (r.meta.changes) newly.push(earned[i]); });
  }
  const hl = [];
  for (const c of newly) if (['expert_solve', 'flawless', 'streak_7', 'fifty_games', 'daily_top', 'speed_hard'].includes(c)) hl.push(['achievement', `${player.nickname} earned “${ACH[c].split(' — ')[0]}”`]);
  const best = await env.DB.prepare('SELECT MAX(score) m FROM scores WHERE mode = ? AND id != ?').bind(b.mode, ins.id).first();
  const allTimeRecord = !best.m || score > best.m;
  if (allTimeRecord) hl.push(['record', `${player.nickname} set a new ${mode.label} record: ${score} pts`]);
  if (hl.length) {
    const stmt = env.DB.prepare('INSERT INTO highlights (player_id, nickname, kind, message, created_at) VALUES (?,?,?,?,?)');
    await env.DB.batch(hl.map(([k, m]) => stmt.bind(player.id, player.nickname, k, m, now)));
  }
  const pb = await env.DB.prepare('SELECT MAX(score) m FROM scores WHERE player_id = ? AND mode = ? AND id != ?').bind(player.id, b.mode, ins.id).first();
  return json({ ok: true, id: ins.id, score, dailyRank, streak, personalBest: !pb.m || score > pb.m, allTimeRecord,
    achievements: newly.map(c => ({ code: c, title: ACH[c] })) });
}

async function leaderboard(env, url) {
  const mode = url.searchParams.get('mode') || 'easy';
  if (!MODES[mode]) return err('bad mode');
  const scope = url.searchParams.get('scope') || 'daily';
  let rows;
  const base = `SELECT p.nickname, MAX(s.score) score, s.time_ms, s.hints, s.player_id FROM scores s JOIN players p ON p.id = s.player_id`;
  if (scope === 'daily') {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('day') || '') ? url.searchParams.get('day') : utcDay();
    rows = await env.DB.prepare(`${base} WHERE s.daily_id = ? GROUP BY s.player_id ORDER BY score DESC, s.time_ms ASC LIMIT 25`).bind(`${day}:${mode}`).all();
  } else if (scope === 'week') {
    rows = await env.DB.prepare(`${base} WHERE s.mode = ? AND s.created_at > ? GROUP BY s.player_id ORDER BY score DESC LIMIT 25`).bind(mode, Date.now() - 7 * 86400000).all();
  } else {
    rows = await env.DB.prepare(`${base} WHERE s.mode = ? GROUP BY s.player_id ORDER BY score DESC LIMIT 25`).bind(mode).all();
  }
  const me = url.searchParams.get('me');
  return json({ ok: true, mode, scope, entries: rows.results.map((r, i) => ({ rank: i + 1, nickname: r.nickname, score: r.score, timeMs: r.time_ms, hints: r.hints, me: !!me && r.player_id === me })) },
    200, { 'cache-control': 'public, max-age=15' });
}

async function me(env, url) {
  const id = url.searchParams.get('id');
  if (!validId(id)) return err('bad id');
  const p = await env.DB.prepare('SELECT nickname, games, best_streak, created_at FROM players WHERE id = ?').bind(id).first();
  if (!p) return json({ ok: true, player: null });
  const bests = await env.DB.prepare('SELECT mode, MAX(score) best, MIN(time_ms) fastest, COUNT(*) games FROM scores WHERE player_id = ? GROUP BY mode').bind(id).all();
  const ach = await env.DB.prepare('SELECT code, earned_at FROM achievements WHERE player_id = ? ORDER BY earned_at').bind(id).all();
  return json({ ok: true, player: p, bests: bests.results, achievements: ach.results.map(a => ({ ...a, title: ACH[a.code] || a.code })) });
}

async function stats(env) {
  const rows = await env.DB.prepare(`SELECT key, value FROM community_stats WHERE key NOT LIKE 'games_day_%' OR key = ?`).bind(`games_day_${utcDay()}`).all();
  const s = Object.fromEntries(rows.results.map(r => [r.key, r.value]));
  const hl = await env.DB.prepare('SELECT nickname, kind, message, created_at FROM highlights ORDER BY created_at DESC LIMIT 12').all();
  return json({ ok: true, day: utcDay(), number: dayNumber(utcDay()), gamesToday: s[`games_day_${utcDay()}`] || 0,
    gamesTotal: s.games_total || 0, players: s.players_total || 0, dailyTotal: s.daily_total || 0,
    byMode: Object.fromEntries(Object.keys(MODES).map(m => [m, s[`games_${m}`] || 0])), highlights: hl.results },
    200, { 'cache-control': 'public, max-age=20' });
}

async function api(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '');
  const m = request.method;
  if (path === '/api/health') return json({ ok: true, service: 'prismku', day: utcDay(), number: dayNumber(utcDay()) });
  if (path === '/api/daily' && m === 'GET') {
    const mode = url.searchParams.get('mode') || 'easy';
    if (!MODES[mode]) return err('bad mode');
    const row = await ensureDaily(env, utcDay(), mode);
    return json({ ok: true, day: row.day, number: row.number, mode, seed: row.seed, size: row.size }, 200, { 'cache-control': 'public, max-age=60' });
  }
  if (path === '/api/player' && m === 'POST') return upsertPlayer(env, request);
  if (path === '/api/scores' && m === 'POST') return submitScore(env, request);
  if (path === '/api/leaderboard' && m === 'GET') return leaderboard(env, url);
  if (path === '/api/me' && m === 'GET') return me(env, url);
  if (path === '/api/stats' && m === 'GET') return stats(env);
  return err('not found', 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname.startsWith('/api/')) {
      try { return await api(request, env, url); }
      catch (e) {
        if (e instanceof SyntaxError || String(e.message).includes('too large')) return err('bad request');
        console.error('api error', e?.stack || e);
        return err('server error', 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(event, env, ctx) {
    // Pre-generate tomorrow's dailies and clean old rate-limit rows.
    const tomorrow = utcDay(Date.now() + 86400000);
    for (const mode of Object.keys(MODES)) { await ensureDaily(env, utcDay(), mode); await ensureDaily(env, tomorrow, mode); }
    await env.DB.prepare('DELETE FROM rate_limits WHERE window < ?').bind(Math.floor(Date.now() / 60000) - 10).run();
  },
};
