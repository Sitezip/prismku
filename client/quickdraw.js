// Quick Draw: a 2×2 box holding the four Easy colors once each, with one tile empty. The answer is the one
// missing color, a single logical move. Shared by the page (client/quick-draw/) and the Worker (src/quickdraw.js).
export const QD = {
  colors: 4,
  minDelayMs: 1500, maxDelayMs: 4500, // random wait before the board appears
  minMs: 100,                         // anything faster is not a human reaction
  penaltyMs: 1000,                    // a wrong color adds a second; a second wrong color fails the round
  maxWrong: 1,
  maxLagMs: 1200,                     // network slack allowed between the server's span and the claimed time
  skewMs: 250,                        // a claim may exceed the server span by at most this
  expireMs: 60000,                    // a revealed round must be finished within a minute
};

// rand() returns a float in [0,1). Board is 4 colors (1..4) in a 2×2 box; empty is the index left blank.
export function makeRound(rand = Math.random) {
  const cells = [1, 2, 3, 4];
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  const empty = Math.floor(rand() * 4);
  const answer = cells[empty];
  const board = cells.slice(); board[empty] = 0;
  const delayMs = Math.round(QD.minDelayMs + rand() * (QD.maxDelayMs - QD.minDelayMs));
  return { board, empty, answer, delayMs };
}

// The logical move: the only color 1..4 not already in the box.
export function answerOf(board) {
  const missing = [1, 2, 3, 4].filter(c => !board.includes(c));
  return missing.length === 1 && board.filter(v => v === 0).length === 1 ? missing[0] : null;
}

// Final time for a round: reaction time plus a second per wrong color.
export const totalMs = (reactionMs, wrong) => Math.round(reactionMs) + wrong * QD.penaltyMs;

// 3 decimals, never microseconds (browsers clamp timer precision anyway).
export const fmtSec = (ms) => (Math.max(0, ms) / 1000).toFixed(3) + ' s';

// Server-side check of a claimed reaction time against the server's own reveal→finish span.
// Returns { ok, ms, note } where ms is the time to store (corrected down to the server span minus lag at most).
export function checkReaction({ claimedMs, wallMs, wrong }) {
  if (!Number.isFinite(claimedMs) || !Number.isFinite(wallMs)) return { ok: false, note: 'bad time' };
  if (!Number.isInteger(wrong) || wrong < 0 || wrong > QD.maxWrong) return { ok: false, note: 'bad wrong count' };
  if (claimedMs < QD.minMs || wallMs < QD.minMs) return { ok: false, note: 'too fast' };
  if (wallMs > QD.expireMs) return { ok: false, note: 'too slow' };
  if (claimedMs > wallMs + QD.skewMs) return { ok: false, note: 'clock mismatch' };
  let ms = claimedMs, note = null;
  if (claimedMs < wallMs - QD.maxLagMs) { ms = wallMs - QD.maxLagMs; note = 'clock'; }
  return { ok: true, ms: totalMs(ms, wrong), note };
}

const EMO = ['⬛', '🟥', '🟦', '🟨', '🟩'];
export function shareText({ ms, best, wrong = 0, board, answer, url = 'https://prismku.com/quick-draw/' }) {
  const b = board ? board.map(v => EMO[v || answer]) : null;
  const grid = b ? `${b[0]}${b[1]}\n${b[2]}${b[3]}\n` : '';
  const pb = best != null && best < ms ? ` (PB ${fmtSec(best)})` : best === ms ? ' (new PB!)' : '';
  return `⚡ Prismku Quick Draw: ${fmtSec(ms)}${pb}${wrong ? ' · 1 slip' : ''}\n${grid}Can you draw faster? ${url}`;
}
