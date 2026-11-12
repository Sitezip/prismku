// Quick Draw API. The server deals each round, decides when it may be revealed, stamps the reveal and the finish
// itself, and checks the claimed reaction time against that span (see checkReaction). Rounds that come back too
// fast, before the reveal, or with the wrong color never reach the leaderboard.
import { QD, makeRound, checkReaction } from '../client/quickdraw.js';

const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

export async function qdStart(env, b, { json, err, validId }) {
  if (!validId(b.playerId)) return err('bad id');
  const r = makeRound(rnd);
  const id = crypto.randomUUID(), now = Date.now();
  await env.DB.prepare('INSERT INTO quickdraw_rounds (id, player_id, created_at, reveal_at, board, answer, status) VALUES (?,?,?,?,?,?,?)')
    .bind(id, b.playerId, now, now + r.delayMs, r.board.join(''), r.answer, 'open').run();
  if (Math.random() < 0.05) await env.DB.prepare("DELETE FROM quickdraw_rounds WHERE status <> 'done' AND created_at < ?").bind(now - 86400000).run();
  return json({ ok: true, roundId: id, delayMs: r.delayMs });
}

async function round(env, b, validId) {
  if (!validId(b.playerId) || !validId(b.roundId)) return null;
  return env.DB.prepare('SELECT * FROM quickdraw_rounds WHERE id = ? AND player_id = ?').bind(b.roundId, b.playerId).first();
}

export async function qdReveal(env, b, { json, err, validId }) {
  const row = await round(env, b, validId);
  if (!row) return err('no such round', 404);
  if (row.status !== 'open' || row.revealed_at) return err('round already revealed', 409);
  const now = Date.now();
  if (now < row.reveal_at - 150) {
    await env.DB.prepare("UPDATE quickdraw_rounds SET status = 'false-start' WHERE id = ?").bind(row.id).run();
    return err('false start', 425);
  }
  await env.DB.prepare('UPDATE quickdraw_rounds SET revealed_at = ? WHERE id = ? AND revealed_at IS NULL').bind(now, row.id).run();
  return json({ ok: true, board: row.board.split('').map(Number) });
}

export async function qdFinish(env, b, { json, err, validId, auth }) {
  const row = await round(env, b, validId);
  if (!row) return err('no such round', 404);
  if (row.status !== 'open' || !row.revealed_at || row.finished_at) return err('round is not live', 409);
  const now = Date.now();
  const fail = async (note, status = 400) => {
    await env.DB.prepare("UPDATE quickdraw_rounds SET status = 'rejected', finished_at = ?, note = ? WHERE id = ?").bind(now, note, row.id).run();
    return err(note, status);
  };
  if (Number(b.color) !== row.answer) return fail('wrong color');
  const c = checkReaction({ claimedMs: Number(b.ms), wallMs: now - row.revealed_at, wrong: Number(b.wrong ?? 0) });
  if (!c.ok) return fail(c.note);
  const player = b.secret ? await auth(env, b.playerId, b.secret) : null;
  const ranked = player ? 1 : 0;
  const day = new Date(now).toISOString().slice(0, 10);
  await env.DB.prepare("UPDATE quickdraw_rounds SET status = 'done', finished_at = ?, ms = ?, ranked = ?, day = ?, note = ? WHERE id = ?")
    .bind(now, c.ms, ranked, day, c.note, row.id).run();
  let rank = null;
  if (ranked) {
    const best = await env.DB.prepare("SELECT MIN(ms) ms FROM quickdraw_rounds WHERE player_id = ? AND status = 'done' AND ranked = 1 AND day = ?").bind(player.id, day).first();
    const ahead = await env.DB.prepare("SELECT COUNT(*) n FROM (SELECT player_id, MIN(ms) m FROM quickdraw_rounds WHERE status = 'done' AND ranked = 1 AND day = ? GROUP BY player_id) WHERE m < ?").bind(day, best.ms).first();
    rank = ahead.n + 1;
  }
  return json({ ok: true, ms: c.ms, ranked: !!ranked, corrected: c.note === 'clock', rankToday: rank });
}

export async function qdLeaderboard(env, url, { json, validId }) {
  const scope = url.searchParams.get('scope') === 'all' ? 'all' : 'daily';
  const me = url.searchParams.get('me');
  const day = new Date().toISOString().slice(0, 10);
  const where = scope === 'daily' ? 'AND r.day = ?1' : '';
  const stmt = env.DB.prepare(`SELECT p.nickname, MIN(r.ms) ms, r.player_id FROM quickdraw_rounds r JOIN players p ON p.id = r.player_id
    WHERE r.status = 'done' AND r.ranked = 1 ${where} GROUP BY r.player_id ORDER BY ms ASC LIMIT 10`);
  const { results } = await (scope === 'daily' ? stmt.bind(day) : stmt).all();
  const entries = results.map((e, i) => ({ rank: i + 1, nickname: e.nickname, ms: e.ms, me: validId(me) && e.player_id === me }));
  return json({ ok: true, scope, day, entries }, 200, { 'cache-control': 'no-store' });
}

export { QD };
