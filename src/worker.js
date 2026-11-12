// Prismku (Rainbow Sudoku) — Cloudflare Worker: JSON API on D1 + static SPA assets.
import { MODES, generate, isSolved, stringToGrid, gridToString, dailySeed, computeScore } from '../client/puzzle.js';
import { checkClock, minSolveMs } from './clock.js';
import { qdStart, qdReveal, qdFinish, qdLeaderboard } from './quickdraw.js';
import { FIX_FROM, isValidEmail, planFixUpdate, renderFixEmail } from './feedback-mail.js';

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
  daily_rainbow: 'Full Rainbow — solved Easy, Medium, Hard and Expert on the same day',
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

async function ipHash(env, request) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  return (await sha256(`${ip}|${env.RL_SALT || 'prismku'}|${utcDay()}`)).slice(0, 24);
}

// perDay=true: one counter per UTC day (row kept until the day ends), else per minute.
async function rateLimit(env, request, action, max, perDay = false) {
  const iph = await ipHash(env, request);
  const minute = Math.floor(Date.now() / 60000);
  const window = perDay ? Math.floor((Date.parse(utcDay()) + 86400000) / 60000) : minute;
  const bucket = perDay ? utcDay() : minute;
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, window, count) VALUES (?1, ?2, 1)
     ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count`
  ).bind(`${iph}:${action}:${bucket}`, window).first();
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM rate_limits WHERE window < ?').bind(minute - 5).run();
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
  const claimedMs = Math.round(Number(b.timeMs)), moves = Math.round(Number(b.moves));
  const hints = Math.round(Number(b.hints) || 0), mistakes = Math.round(Number(b.mistakes) || 0);
  const floorMs = minSolveMs(b.mode, empty);
  if (!(claimedMs >= floorMs && claimedMs <= 6 * 3600 * 1000)) return err('time out of range');
  if (!(moves >= empty - hints && moves <= 5000)) return err('moves out of range');
  if (!(hints >= 0 && hints <= empty) || !(mistakes >= 0 && mistakes <= 2000)) return err('stats out of range');
  const version = String(b.version || 'unknown').slice(0, 20);
  const now = Date.now(), day = utcDay();
  const play = await env.DB.prepare('SELECT started_at, finished_at FROM plays WHERE player_id = ? AND mode = ? AND seed = ?').bind(player.id, b.mode, seed).first();
  const clock = checkClock({ claimedMs, startedAt: play?.started_at, finishedAt: play?.finished_at, now, floorMs });
  const timeMs = Math.min(clock.timeMs, 6 * 3600 * 1000), ranked = clock.ranked;
  const score = computeScore(b.mode, timeMs, hints, mistakes);

  let ins;
  try {
    ins = await env.DB.prepare(`INSERT INTO scores (player_id, mode, size, seed, daily_id, time_ms, moves, hints, mistakes, score, version, day, created_at, ranked, client_ms, check_note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`).bind(player.id, b.mode, mode.size, seed, dailyId, timeMs, moves, hints, mistakes, score, version, day, now, ranked, claimedMs, clock.note).first();
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
  want(ranked && b.mode === 'easy' && timeMs < 10000 && !hints, 'speed_easy');
  want(ranked && b.mode === 'hard' && timeMs < 60000 && !hints, 'speed_hard');
  want(games >= 10, 'ten_games');
  want(games >= 50, 'fifty_games');
  let streak = 0;
  if (dailyId) {
    const rows = await env.DB.prepare('SELECT DISTINCT substr(daily_id,1,10) d FROM scores WHERE player_id = ? AND daily_id IS NOT NULL ORDER BY d DESC LIMIT 60').bind(player.id).all();
    streak = streakFrom(rows.results.map(r => r.d));
    want(streak >= 3, 'streak_3');
    want(streak >= 7, 'streak_7');
    if (streak > player.best_streak) await env.DB.prepare('UPDATE players SET best_streak = ? WHERE id = ?').bind(streak, player.id).run();
    const modesToday = await env.DB.prepare(
      'SELECT COUNT(DISTINCT mode) c FROM scores WHERE player_id = ? AND substr(daily_id, 1, 10) = ?'
    ).bind(player.id, day).first();
    want((modesToday?.c || 0) >= 4, 'daily_rainbow');
  }
  let dailyRank = null;
  if (dailyId && ranked) {
    const r = await env.DB.prepare('SELECT COUNT(*) c FROM scores WHERE daily_id = ? AND ranked = 1 AND score > ?').bind(dailyId, score).first();
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
  for (const c of newly) if (['expert_solve', 'flawless', 'streak_7', 'fifty_games', 'daily_top', 'speed_hard', 'daily_rainbow'].includes(c)) hl.push(['achievement', `${player.nickname} earned “${ACH[c].split(' — ')[0]}”`]);
  const best = await env.DB.prepare('SELECT MAX(score) m FROM scores WHERE mode = ? AND ranked = 1 AND id != ?').bind(b.mode, ins.id).first();
  const allTimeRecord = !!ranked && (!best.m || score > best.m);
  if (allTimeRecord) hl.push(['record', `${player.nickname} set a new ${mode.label} record: ${score} pts`]);
  if (hl.length) {
    const stmt = env.DB.prepare('INSERT INTO highlights (player_id, nickname, kind, message, created_at) VALUES (?,?,?,?,?)');
    await env.DB.batch(hl.map(([k, m]) => stmt.bind(player.id, player.nickname, k, m, now)));
  }
  const pb = await env.DB.prepare('SELECT MAX(score) m FROM scores WHERE player_id = ? AND mode = ? AND ranked = 1 AND id != ?').bind(player.id, b.mode, ins.id).first();
  return json({ ok: true, id: ins.id, score, timeMs, ranked: !!ranked, clock: clock.note, dailyRank, streak, personalBest: !!ranked && (!pb.m || score > pb.m), allTimeRecord,
    achievements: newly.map(c => ({ code: c, title: ACH[c] })) });
}

// POST /api/play/start {playerId, mode, seed} — the client calls this the moment a board is first shown.
// POST /api/play/finish {playerId, mode, seed, grid} — on solve; the grid must be a real solution, so the
// finish stamp can't be taken before the puzzle is actually solved. First stamp wins (INSERT/UPDATE only if unset).
async function playStamp(env, request, kind) {
  if (!await rateLimit(env, request, 'play', 60)) return err('slow down', 429);
  const b = await readJson(request);
  if (!validId(b.playerId)) return err('bad id');
  const mode = MODES[b.mode];
  if (!mode) return err('bad mode');
  const seed = Number(b.seed);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return err('bad seed');
  const now = Date.now();
  if (kind === 'start') {
    await env.DB.prepare('INSERT OR IGNORE INTO plays (player_id, mode, seed, started_at) VALUES (?,?,?,?)').bind(b.playerId, b.mode, seed, now).run();
  } else {
    if (typeof b.grid !== 'string' || b.grid.length !== mode.size * mode.size) return err('bad grid');
    const { puzzle } = generate(b.mode, seed);
    if (!isSolved(stringToGrid(b.grid), puzzle, b.mode)) return err('grid is not a valid solution');
    await env.DB.prepare('UPDATE plays SET finished_at = ? WHERE player_id = ? AND mode = ? AND seed = ? AND finished_at IS NULL').bind(now, b.playerId, b.mode, seed).run();
  }
  return json({ ok: true });
}

const FEEDBACK_TYPES = ['bug', 'idea', 'other'];
const CTX_KEYS = { version: 20, mode: 10, seed: 12, daily: 5, day: 10, ua: 300, screen: 20, viewport: 20, url: 200, playerId: 36, theme: 12, cb: 5, lang: 20, solved: 5, elapsedMs: 12 };

async function submitFeedback(env, request) {
  const b = await readJson(request);
  // Honeypot: real players never see or fill this field. Pretend success, store nothing.
  if (b.website) return json({ ok: true, id: null });
  const type = String(b.type || '');
  if (!FEEDBACK_TYPES.includes(type)) return err('pick bug, idea or other');
  const message = typeof b.message === 'string' ? b.message.replace(/\r\n/g, '\n').trim() : '';
  if (message.length < 5) return err('please write a little more (5+ characters)');
  if (message.length > 1000) return err('message is too long (max 1000 characters)');
  let contact = typeof b.contact === 'string' ? b.contact.trim() : '';
  if (contact && !isValidEmail(contact)) return err('that email address looks invalid');
  const ctx = {};
  if (b.context && typeof b.context === 'object') {
    for (const [k, max] of Object.entries(CTX_KEYS)) {
      const v = b.context[k];
      if (v === undefined || v === null) continue;
      ctx[k] = typeof v === 'number' || typeof v === 'boolean' ? v : String(v).slice(0, max);
    }
  }
  ctx.country = request.cf?.country || null;
  // Rate limit only well-formed tickets (invalid ones never touch the table).
  if (!await rateLimit(env, request, 'feedback', 5)) return err('slow down — try again in a minute', 429);
  if (!await rateLimit(env, request, 'feedback-day', 20, true)) return err('daily feedback limit reached — thank you!', 429);
  const row = await env.DB.prepare('INSERT INTO feedback (created_at, type, message, contact, context, status, ip_hash) VALUES (?,?,?,?,?,?,?) RETURNING id')
    .bind(Date.now(), type, message, contact || null, JSON.stringify(ctx), 'new', await ipHash(env, request)).first();
  return json({ ok: true, id: row.id });
}

async function secretMatches(provided, expected) {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(provided)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  if (typeof crypto.subtle.timingSafeEqual === 'function') return crypto.subtle.timingSafeEqual(x, y);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function adminAuthorized(env, request) {
  const expected = env.FEEDBACK_ADMIN_SECRET;
  if (typeof expected !== 'string' || expected.length < 16) return false;
  const header = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(\S{1,256})$/i.exec(header);
  if (!match) return false;
  return secretMatches(match[1], expected);
}

// POST /api/admin/feedback/:id  { status: "done"|"fixed"|... }
// Authorization: Bearer $FEEDBACK_ADMIN_SECRET
// A change to done/fixed emails the address stored on that ticket, at most once.
export async function adminFeedback(env, request, id) {
  if (!(await adminAuthorized(env, request))) return err('unauthorized', 401);
  if (!Number.isInteger(id) || id < 1) return err('bad ticket', 400);
  let body;
  try { body = await readJson(request); }
  catch (e) {
    if (e instanceof SyntaxError || String(e.message || '').includes('too large')) return err('bad request');
    throw e;
  }
  const requested = typeof body.status === 'string' ? body.status : '';
  const row = await env.DB.prepare(
    `SELECT f.id, f.status, f.message, f.contact, e.sent_at AS fix_email_sent_at
     FROM feedback f LEFT JOIN feedback_fix_email e ON e.feedback_id = f.id WHERE f.id = ?`
  ).bind(id).first();
  if (!row) return err('ticket not found', 404);
  const hourAgo = Date.now() - 3600000;
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM feedback_fix_email WHERE sent_at > ?').bind(hourAgo).first();
  const plan = planFixUpdate(row, requested, { recentSends: Number(recent?.n || 0) });
  if (!plan.ok) return err(plan.error, plan.http);
  if (!plan.send) {
    await env.DB.prepare('UPDATE feedback SET status = ? WHERE id = ?').bind(plan.status, id).run();
    return json({ ok: true, id, status: plan.status, email: plan.email });
  }
  const now = Date.now();
  const claim = await env.DB.prepare(
    `INSERT INTO feedback_fix_email (feedback_id, sent_at) VALUES (?, ?)
     ON CONFLICT(feedback_id) DO UPDATE SET sent_at = excluded.sent_at
     WHERE feedback_fix_email.sent_at < ?`
  ).bind(id, -now, -(now - 10 * 60 * 1000)).run();
  const changes = claim?.meta?.changes ?? 0;
  if (!changes) return json({ ok: true, id, status: row.status, email: 'in-progress' });
  await env.DB.prepare('UPDATE feedback SET status = ? WHERE id = ?').bind('done', id).run();
  try {
    if (!env.EMAIL || typeof env.EMAIL.send !== 'function') throw new Error('email binding missing');
    const notice = renderFixEmail(row.message);
    await env.EMAIL.send({
      to: plan.to,
      from: FIX_FROM,
      subject: notice.subject,
      text: notice.text,
      html: notice.html,
    });
    await env.DB.prepare('UPDATE feedback_fix_email SET sent_at = ? WHERE feedback_id = ? AND sent_at = ?').bind(Date.now(), id, -now).run();
    return json({ ok: true, id, status: 'done', email: 'sent' });
  } catch (e) {
    await env.DB.prepare('DELETE FROM feedback_fix_email WHERE feedback_id = ? AND sent_at = ?').bind(id, -now).run();
    console.error('fix email failed', e?.code || e?.message || e);
    return json({ ok: false, id, status: 'done', email: 'failed', error: 'ticket marked done but the email could not be sent — call again to retry' }, 502);
  }
}

async function leaderboard(env, url) {
  const mode = url.searchParams.get('mode') || 'easy';
  if (!MODES[mode]) return err('bad mode');
  const scope = url.searchParams.get('scope') || 'daily';
  let rows;
  const base = `SELECT p.nickname, MAX(s.score) score, s.time_ms, s.hints, s.player_id FROM scores s JOIN players p ON p.id = s.player_id`;
  if (scope === 'daily') {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('day') || '') ? url.searchParams.get('day') : utcDay();
    rows = await env.DB.prepare(`${base} WHERE s.daily_id = ? AND s.ranked = 1 GROUP BY s.player_id ORDER BY score DESC, s.time_ms ASC LIMIT 25`).bind(`${day}:${mode}`).all();
  } else if (scope === 'week') {
    rows = await env.DB.prepare(`${base} WHERE s.mode = ? AND s.ranked = 1 AND s.created_at > ? GROUP BY s.player_id ORDER BY score DESC, s.time_ms ASC LIMIT 25`).bind(mode, Date.now() - 7 * 86400000).all();
  } else {
    rows = await env.DB.prepare(`${base} WHERE s.mode = ? AND s.ranked = 1 GROUP BY s.player_id ORDER BY score DESC, s.time_ms ASC LIMIT 25`).bind(mode).all();
  }
  const me = url.searchParams.get('me');
  return json({ ok: true, mode, scope, entries: rows.results.map((r, i) => ({ rank: i + 1, nickname: r.nickname, score: r.score, timeMs: r.time_ms, hints: r.hints, me: !!me && r.player_id === me })) },
    200, { 'cache-control': 'no-store' }); // fresh after a score submit (issue #1)
}

async function me(env, url) {
  const id = url.searchParams.get('id');
  if (!validId(id)) return err('bad id');
  const p = await env.DB.prepare('SELECT nickname, games, best_streak, created_at FROM players WHERE id = ?').bind(id).first();
  if (!p) return json({ ok: true, player: null });
  const bests = await env.DB.prepare('SELECT mode, MAX(score) best, MIN(time_ms) fastest, COUNT(*) games FROM scores WHERE player_id = ? AND ranked = 1 GROUP BY mode').bind(id).all();
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
  if (path === '/api/play/start' && m === 'POST') return playStamp(env, request, 'start');
  if (path === '/api/play/finish' && m === 'POST') return playStamp(env, request, 'finish');
  if (path === '/api/feedback' && m === 'POST') return submitFeedback(env, request);
  if (path.startsWith('/api/qd/') && m === 'POST') {
    if (!await rateLimit(env, request, 'qd', 90)) return err('slow down', 429);
    const b = await readJson(request), h = { json, err, validId, auth };
    if (path === '/api/qd/start') return qdStart(env, b, h);
    if (path === '/api/qd/reveal') return qdReveal(env, b, h);
    if (path === '/api/qd/finish') return qdFinish(env, b, h);
  }
  if (path === '/api/qd/leaderboard' && m === 'GET') return qdLeaderboard(env, url, { json, validId });
  const adminTicket = /^\/api\/admin\/feedback\/(\d+)$/.exec(path);
  if (adminTicket && m === 'POST') return adminFeedback(env, request, Number(adminTicket[1]));
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
    await env.DB.prepare('DELETE FROM plays WHERE started_at < ?').bind(Date.now() - 30 * 86400000).run();
    await env.DB.prepare("DELETE FROM quickdraw_rounds WHERE status <> 'done' AND created_at < ?").bind(Date.now() - 86400000).run();
  },
};
