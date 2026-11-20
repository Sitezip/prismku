import { QD, makeRound, answerOf, totalMs, fmtSec, shareText } from '../quickdraw.js';

const $ = (s) => document.querySelector(s);
const ARCHIVE = /^\/v\/\d{4}-\d{2}-\d{2}\//.test(location.pathname);
const NS = ARCHIVE ? 'pka.' : 'pk.';
const store = {
  get(k, d = null, ns = NS) { try { const v = localStorage.getItem(ns + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v, ns = NS) { try { localStorage.setItem(ns + k, JSON.stringify(v)); } catch {} },
};
const NAMES = ['', 'Red', 'Blue', 'Yellow', 'Green'];
const SYM = ['', '<circle cx="12" cy="12" r="9"/>', '<rect x="4" y="4" width="16" height="16" rx="2"/>', '<path d="M12 3 22 20H2z"/>', '<path d="M12 2 22 12 12 22 2 12z"/>'];
const settings = Object.assign({ sound: true, cb: false, theme: 'classic' }, store.get('settings', {}, 'pk.'));
if (settings.theme && settings.theme !== 'classic') document.body.classList.add('theme-' + settings.theme);
const sym = (v) => settings.cb ? `<svg viewBox="0 0 24 24" aria-hidden="true">${SYM[v]}</svg>` : '';

// Same identity as the main game, so one nickname works everywhere.
function identity() {
  let p = store.get('player', null, 'pk.');
  if (!p) {
    const b = new Uint8Array(24); crypto.getRandomValues(b);
    p = { id: crypto.randomUUID(), secret: btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), nick: null, registered: false };
    store.set('player', p, 'pk.');
  }
  return p;
}
const player = identity();
async function api(path, body) {
  const res = await fetch('/api/' + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await res.json().catch(() => ({ ok: false, error: 'network' }));
  data.status = res.status; return data;
}

let actx = null;
function tone(freq, dur = 0.1, type = 'sine', vol = 0.12) {
  if (!settings.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur);
  } catch {}
}

// ---------- state ----------
// phase: idle | waiting | live | over
const S = { phase: 'idle', round: null, board: null, t0: 0, wrong: 0, timer: 0, server: false, token: 0, last: null };
const hist = store.get('qd.hist', []);
let best = store.get('qd.best', null);

function renderBoard(board, reveal = false) {
  $('#qboard').innerHTML = [0, 1, 2, 3].map(i => {
    const v = board ? board[i] : -1;
    if (v === -1) return '<div class="qcell"></div>';
    if (v === 0) return `<div class="qcell empty" data-i="${i}"></div>`;
    return `<div class="qcell c${v}">${sym(v)}</div>`;
  }).join('');
  if (reveal) $('#qboard').dataset.live = '1'; else delete $('#qboard').dataset.live;
}
function renderPalette() {
  $('#qpal').innerHTML = [1, 2, 3, 4].map(c => `<button class="qcell c${c}" data-c="${c}" aria-label="${NAMES[c]} (${c})">${sym(c)}</button>`).join('');
}
function renderStats() {
  $('#pb').textContent = best != null ? fmtSec(best) : '–';
  const l5 = hist.slice(-5);
  $('#avg').textContent = l5.length ? fmtSec(l5.reduce((a, b) => a + b, 0) / l5.length) : '–';
  $('#n').textContent = store.get('qd.rounds', 0);
}
const setMsg = (t) => { $('#msg').textContent = t; };
const setArena = (cls) => { $('#arena').className = 'arena' + (cls ? ' ' + cls : ''); };

// ---------- flow ----------
async function start() {
  if (S.phase === 'waiting' || S.phase === 'live') return;
  const token = ++S.token;
  Object.assign(S, { phase: 'waiting', board: null, wrong: 0, server: false, round: null, last: null });
  renderBoard(null); setArena('wait'); setMsg('Wait for it…');
  $('#qtime').textContent = ''; $('#qnote').textContent = ''; $('#share').hidden = true; $('#go').textContent = 'Waiting…'; $('#go').disabled = true;
  let delay;
  if (!ARCHIVE) {
    const r = await api('qd/start', { playerId: player.id }).catch(() => null);
    if (token !== S.token || S.phase !== 'waiting') return;
    if (r?.ok) { S.server = true; S.round = r.roundId; delay = r.delayMs; }
  }
  let local = null;
  if (!S.server) { local = makeRound(); delay = local.delayMs; }
  S.timer = setTimeout(async () => {
    let board = local?.board;
    if (S.server) {
      const r = await api('qd/reveal', { playerId: player.id, roundId: S.round }).catch(() => null);
      if (token !== S.token || S.phase !== 'waiting') return;
      if (r?.ok) board = r.board;
      else { S.server = false; board = makeRound().board; }
    }
    reveal(board, token);
  }, delay);
}

function reveal(board, token) {
  S.board = board; renderBoard(board, true); setArena('live'); setMsg('');
  S.t0 = performance.now(); S.phase = 'live';
  // Restart the clock when the frame with the board is actually painted.
  requestAnimationFrame(() => { if (token === S.token && S.phase === 'live') S.t0 = performance.now(); });
}

function falseStart() {
  clearTimeout(S.timer); S.token++;
  S.phase = 'over'; setArena(''); setMsg('False start!');
  $('#qtime').textContent = '🚫'; $('#qnote').textContent = 'You tapped before the box appeared. This round doesn’t count.';
  tone(160, 0.25, 'square', 0.08); done();
}

function tap(color, ts) {
  if (S.phase === 'idle' || S.phase === 'over') return;
  if (S.phase === 'waiting') return falseStart();
  const now = ts > 0 && Math.abs(ts - performance.now()) < 2000 ? ts : performance.now();
  const reaction = Math.max(0, now - S.t0);
  const answer = answerOf(S.board);
  if (color !== answer) {
    S.wrong++;
    const b = $(`#qpal [data-c="${color}"]`); b?.classList.remove('shake'); void b?.offsetWidth; b?.classList.add('shake');
    tone(180, 0.15, 'sawtooth', 0.07);
    if (S.wrong > QD.maxWrong) {
      S.phase = 'over'; S.token++; setArena(''); setMsg('Missed!');
      $('#qtime').textContent = '✖'; $('#qnote').textContent = `Two wrong colors. It was ${NAMES[answer]}.`;
      if (S.server) api('qd/finish', { playerId: player.id, roundId: S.round, color, ms: Math.round(reaction), wrong: 1 }).catch(() => {});
      return done();
    }
    $('#qnote').textContent = 'Not that one: +1.000 s';
    return;
  }
  S.phase = 'over'; S.token++;
  const ms = totalMs(reaction, S.wrong);
  const board = S.board.slice(); board[board.indexOf(0)] = answer; renderBoard(board);
  $('#qboard').children[S.board.indexOf(0)].classList.add('got');
  setArena(''); setMsg('');
  const prev = best;
  if (best == null || ms < best) { best = ms; store.set('qd.best', best); }
  hist.push(ms); while (hist.length > 20) hist.shift(); store.set('qd.hist', hist);
  store.set('qd.rounds', store.get('qd.rounds', 0) + 1);
  S.last = { ms, best, wrong: S.wrong, board: S.board.slice(), answer };
  $('#qtime').textContent = fmtSec(ms);
  $('#qnote').textContent = (prev == null || ms < prev ? '🏅 New personal best! ' : `Best ${fmtSec(best)}. `) + (S.wrong ? 'Includes a 1.000 s slip.' : '');
  tone(880, 0.08); setTimeout(() => tone(1320, 0.12), 70);
  $('#share').hidden = false;
  if (S.server) submit(Math.round(reaction), answer);
  done();
}

async function submit(reaction, color) {
  const body = { playerId: player.id, roundId: S.round, color, ms: reaction, wrong: S.wrong };
  if (player.registered) body.secret = player.secret;
  const r = await api('qd/finish', body).catch(() => null);
  if (!r) return;
  if (!r.ok) { $('#qnote').textContent += ` (Leaderboard: ${r.error})`; return; }
  if (r.ranked) { $('#qnote').textContent += r.rankToday ? ` You're #${r.rankToday} today.` : ''; loadBoard(); }
  else if (!player.nick) $('#qnote').textContent += ' Add a nickname below to join the leaderboard.';
}

function done() { renderStats(); $('#go').disabled = false; $('#go').textContent = 'Go again'; }

// ---------- leaderboard ----------
let scope = 'daily';
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function loadBoard() {
  if (ARCHIVE) { $('#lb-card').hidden = true; return; }
  const r = await api(`qd/leaderboard?scope=${scope}&me=${player.id}`).catch(() => null);
  if (!r?.ok) { $('#lb').textContent = 'Leaderboard is offline right now.'; return; }
  $('#lb').innerHTML = r.entries.length
    ? `<table class="lb"><tbody>${r.entries.map(e => `<tr class="${e.me ? 'me' : ''}"><td>${e.rank}</td><td>${esc(e.nickname)}</td><td class="s">${fmtSec(e.ms)}</td></tr>`).join('')}</tbody></table>`
    : `<p>No draws yet ${scope === 'daily' ? 'today' : ''}. Be the first!</p>`;
}
function renderNick() {
  $('#nick-row').innerHTML = player.registered
    ? `Playing as <b>${esc(player.nick)}</b>.`
    : `<input id="nick" maxlength="16" placeholder="Nickname" value="${esc(player.nick || '')}" autocomplete="nickname"> <button class="btn" id="save-nick">Join leaderboard</button>`;
}
async function saveNick() {
  const nick = $('#nick').value.trim(); if (!nick) return;
  const r = await api('player', { id: player.id, secret: player.secret, nickname: nick }).catch(() => null);
  if (!r?.ok) { $('#nick-row').insertAdjacentHTML('beforeend', ` <small>${esc(r?.error || 'Could not save')}</small>`); return; }
  player.nick = r.nickname; player.registered = true; store.set('player', player, 'pk.'); renderNick();
}

async function share() {
  if (!S.last) return;
  const text = shareText({ ...S.last, url: location.origin + '/quick-draw/' });
  if (navigator.share && matchMedia('(pointer:coarse)').matches) { try { await navigator.share({ text }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text); $('#share').textContent = 'Copied!'; setTimeout(() => { $('#share').textContent = 'Share'; }, 1500); } catch { prompt('Copy your result', text); }
}

// ---------- input ----------
$('#qpal').addEventListener('pointerdown', (e) => { const b = e.target.closest('[data-c]'); if (b) { e.preventDefault(); tap(+b.dataset.c, e.timeStamp); } });
$('#arena').addEventListener('pointerdown', (e) => { if (S.phase === 'waiting') { e.preventDefault(); falseStart(); } else if (S.phase === 'idle' || S.phase === 'over') start(); });
$('#go').addEventListener('click', start);
$('#share').addEventListener('click', share);
document.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-scope]'); if (!b) return; scope = b.dataset.scope; document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b)); loadBoard(); });
$('#nick-row').addEventListener('click', (e) => { if (e.target.id === 'save-nick') saveNick(); });
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (/^[1-4]$/.test(e.key)) { e.preventDefault(); tap(+e.key, e.timeStamp); }
  else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (S.phase === 'waiting') falseStart(); else start(); }
});

renderBoard(null); renderPalette(); renderStats(); renderNick(); loadBoard();
window.__qd = { S, start, tap, QD };
