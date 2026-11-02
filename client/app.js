import { MODES, MODE_KEYS, generate, conflicts, isSolved, peers, regionOf, dailySeed, computeScore, gridToString } from './puzzle.js';
import { CONFIG } from './config.js';

const $ = (s, el = document) => el.querySelector(s);
const ARCHIVE = /^\/v\/\d{4}-\d{2}-\d{2}\//.test(location.pathname);
const NS = ARCHIVE ? 'pka.' : 'pk.';
const store = {
  get(k, d = null, ns = NS) { try { const v = localStorage.getItem(ns + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v, ns = NS) { try { localStorage.setItem(ns + k, JSON.stringify(v)); } catch {} },
  del(k, ns = NS) { try { localStorage.removeItem(ns + k); } catch {} },
};
const COLOR_NAMES = ['', 'Red', 'Blue', 'Yellow', 'Green', 'Cream', 'Orange', 'Purple', 'Pink', 'Teal'];
const SYM = ['',
  '<circle cx="12" cy="12" r="9"/>', '<rect x="4" y="4" width="16" height="16" rx="2"/>', '<path d="M12 3 22 20H2z"/>',
  '<path d="M12 2 22 12 12 22 2 12z"/>', '<path d="m12 2 2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.1-.6z"/>',
  '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>', '<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/>',
  '<path d="M7 3h10l5 9-5 9H7l-5-9z"/>', '<path d="M15 3a9 9 0 1 0 6 15A7 7 0 0 1 15 3z"/>'];
const svg = (v) => `<svg viewBox="0 0 24 24" aria-hidden="true">${SYM[v]}</svg>`;
const THEMES = [
  { key: 'classic', label: 'Classic' }, { key: 'neon', label: 'Neon' }, { key: 'pastel', label: 'Pastel' },
  { key: 'galaxy', label: 'Galaxy', pro: true }, { key: 'candy', label: 'Candy', pro: true }, { key: 'retro', label: 'Retro LED', pro: true },
];

// ---------- identity ----------
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
const settings = Object.assign({ sound: true, cb: false, theme: 'classic', play: 'daily', mode: 'easy' }, store.get('settings', {}, 'pk.'));
const saveSettings = () => store.set('settings', settings, 'pk.');

// ---------- api ----------
async function api(path, body) {
  const res = await fetch('/api/' + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await res.json().catch(() => ({ ok: false, error: 'network' }));
  data.status = res.status;
  return data;
}

// ---------- sound ----------
let actx = null;
function tone(freq, dur = 0.12, type = 'sine', vol = 0.12, delay = 0) {
  if (!settings.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch {}
}
const SCALE = [0, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5, 1568];
const sfx = {
  place: (v) => tone(SCALE[v], 0.14, 'triangle'),
  erase: () => tone(300, 0.08, 'sine', 0.08),
  clash: () => { tone(160, 0.18, 'sawtooth', 0.06); tone(150, 0.2, 'sawtooth', 0.05, 0.05); },
  hint: () => { tone(880, 0.1); tone(1320, 0.15, 'sine', 0.1, 0.08); },
  win: () => [0, 2, 4, 5, 7, 9].forEach((k, i) => tone(SCALE[k + 1] || 1760, 0.25, 'triangle', 0.12, i * 0.09)),
};

// ---------- utils ----------
const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const dayNumber = (day) => Math.round((Date.parse(day) - Date.parse(CONFIG.launchDay)) / 86400000) + 1;
const fmt = (ms) => { const s = Math.floor(ms / 1000), m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// The toast is a manual popover so it renders in the top layer, above an open modal dialog (ticket #4: on desktop the
// "copied" confirmation was hidden behind the win dialog). Browsers without popovers fall back to the fixed toast.
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; clearTimeout(toast.h); clearTimeout(toast.h2);
  if (t.showPopover) { try { if (t.matches(':popover-open')) t.hidePopover(); t.showPopover(); } catch {} }
  requestAnimationFrame(() => t.classList.add('show'));
  toast.h = setTimeout(() => { t.classList.remove('show'); toast.h2 = setTimeout(() => { try { t.hidePopover?.(); } catch {} }, 320); }, ms);
}

// ---------- game state ----------
let G = null;          // current game
let sel = -1;          // selected cell
let brush = 0;         // armed color
let notesOn = false;   // pencil-mark mode
let serverDay = utcDay();
let tick = null;
const dlgState = {}; // UI state for the open dialog (kept off DOM attributes so closest() never matches the dialog)

function progressKey(play, mode, day) { return play === 'daily' ? `prog.daily.${day}.${mode}` : `prog.free.${mode}`; }

function newGame(play, mode, seed) {
  const day = serverDay;
  if (play === 'daily') seed = dailySeed(day, mode);
  const key = progressKey(play, mode, day);
  const saved = store.get(key);
  if (saved && saved.seed === seed && saved.mode === mode) { G = restore(saved); }
  else {
    const p = generate(mode, seed);
    G = { play, mode, seed: p.seed, day, number: dayNumber(day), puzzle: p.puzzle, solution: p.solution, grid: p.puzzle.slice(),
      places: p.puzzle.map(() => 0), hinted: p.puzzle.map(() => false), notes: p.puzzle.map(() => 0), moves: 0, hints: 0, mistakes: 0, elapsed: 0, done: false, hist: [], result: null, seen: false };
  }
  G.key = key; G.startedAt = performance.now();
  sel = -1; brush = 0;
  settings.play = play; settings.mode = mode; saveSettings();
  render(true); startTimer(); updatePaused();
  if (G.done) showDoneState(); else if (G.seen) sendStart();
}
function restore(s) {
  const p = generate(s.mode, s.seed);
  const g = { ...s, notes: Array.isArray(s.notes) && s.notes.length === p.puzzle.length ? s.notes : p.puzzle.map(() => 0), puzzle: p.puzzle, solution: p.solution };
  // Progress saved before the anti-pause fix has no `seen` flag: any played board counts as seen.
  if (g.seen === undefined) g.seen = g.moves > 0 || g.elapsed > 0;
  // Once a board has been seen its clock never stops, even while you're away (closed tab, other board),
  // otherwise you could look, leave, solve on paper and come back. The server clock enforces the same rule.
  if (g.seen && !g.done && g.savedAt) g.elapsed += Math.max(0, Math.min(Date.now() - g.savedAt, 7 * 86400000));
  return g;
}
function persist() {
  if (!G) return;
  const { puzzle, solution, startedAt, key, finishP, ...rest } = G;
  rest.elapsed = elapsed(); rest.hist = rest.hist.slice(-200); rest.savedAt = Date.now();
  store.set(G.key, rest);
}
// Anti-cheat (Jake, 2026-11-01): pausing after the board was visible let you study it, open a menu, solve on paper
// and enter the answer in seconds. Now the clock can only be held (dialog open / tab hidden, board veiled) before a
// board has ever been shown — e.g. a first-time player reading the how-to. Once the board has been painted
// unveiled, the clock runs until it is solved, menus or not. The server times the same span (see /api/play/*).
const holds = new Set(document.hidden ? ['hidden'] : []);
const running = () => holds.size === 0 || !!(G && G.seen && !G.done);
function checkSeen() {
  if (!G || G.seen || G.done || holds.size) return;
  const g = G; // seen once two frames have painted with the board unveiled
  requestAnimationFrame(() => requestAnimationFrame(() => { if (G === g && !g.seen && !holds.size) markSeen(g); }));
}
function markSeen(g) {
  if (g.seen) return;
  if (G === g) { g.elapsed = elapsed(); g.startedAt = performance.now(); }
  g.seen = true; if (G === g) { persist(); sendStart(); }
}
function sendStart() {
  if (ARCHIVE || !G || G.done) return;
  api('play/start', { playerId: player.id, mode: G.mode, seed: G.seed }).catch(() => {});
}
function setHold(reason, on) {
  if (on === holds.has(reason)) return;
  const was = running();
  if (G && !G.done && was) G.elapsed += performance.now() - G.startedAt;
  on ? holds.add(reason) : holds.delete(reason);
  if (G) G.startedAt = performance.now();
  if (was !== running()) updatePaused();
}
function updatePaused() { document.body.classList.toggle('paused', !!G && !G.done && !running()); if (G && !G.done) $('#hud-time').textContent = fmt(elapsed()); checkSeen(); }
function elapsed() { return G.done ? G.elapsed : G.elapsed + (running() ? performance.now() - G.startedAt : 0); }
function startTimer() {
  clearInterval(tick);
  tick = setInterval(() => { if (G && !G.done) $('#hud-time').textContent = fmt(elapsed()); }, 250);
}
document.addEventListener('visibilitychange', () => { setHold('hidden', document.hidden); if (document.hidden) persist(); });
window.addEventListener('pagehide', persist);

// ---------- rendering ----------
function render(full) {
  const m = MODES[G.mode], n = m.size;
  let board = $('#board');
  if (full) {
    // Swap in a brand-new board element: reusing the old one could leave stale composited tiles
    // from the previous size painted over some rows until the next focus/hover repaint (issue #2).
    const fresh = board.cloneNode(false); board.replaceWith(fresh); board = fresh;
    if (document.activeElement && document.activeElement.closest?.('.board')) document.activeElement.blur();
    const gap = n >= 9 ? 3 : n >= 6 ? 4 : 6;
    board.style.setProperty('--gap', gap + 'px'); board.style.setProperty('--n', n);
    board.style.setProperty('--cr', (n >= 9 ? 6 : n >= 6 ? 9 : 12) + 'px');
    // Explicit equal rows too: auto rows could size unevenly (a short first row on Easy), so the box
    // divider no longer ran through the gap between rows (ticket #2).
    board.style.gridTemplateColumns = board.style.gridTemplateRows = `repeat(${n}, minmax(0, 1fr))`;
    board.classList.remove('win');
    for (let i = 0; i < n * n; i++) {
      const b = document.createElement('button');
      b.className = 'cell'; b.dataset.i = i; b.setAttribute('role', 'gridcell');
      b.style.setProperty('--d', Math.floor(i / n) + (i % n));
      board.appendChild(b);
    }
    if (m.box) {
      const [bh, bw] = m.box;
      for (let k = bw; k < n; k += bw) { const l = document.createElement('i'); l.className = 'rline v'; l.style.setProperty('--k', k); board.appendChild(l); }
      for (let k = bh; k < n; k += bh) { const l = document.createElement('i'); l.className = 'rline h'; l.style.setProperty('--k', k); board.appendChild(l); }
    }
    const pal = $('#palette'); pal.innerHTML = ''; pal.style.setProperty('--pn', n);
    for (let v = 1; v <= n; v++) {
      const s = document.createElement('button');
      s.className = 'swatch'; s.dataset.v = v; s.style.setProperty('--col', `var(--c${v})`);
      s.setAttribute('aria-label', COLOR_NAMES[v]);
      s.innerHTML = `${svg(v)}<kbd>${v}</kbd><span class="cnt"></span>`;
      pal.appendChild(s);
    }
    document.querySelectorAll('#diff button').forEach(b => b.classList.toggle('on', b.dataset.mode === G.mode));
    document.querySelectorAll('[data-play]').forEach(b => b.classList.toggle('on', b.dataset.play === G.play));
    $('#btn-new').hidden = G.play !== 'free';
    $('#daily-no').textContent = '#' + dayNumber(serverDay);
  }
  const bad = conflicts(G.grid, G.mode), P = peers(G.mode);
  const peerSet = new Set(sel >= 0 ? P[sel] : []);
  const cells = board.querySelectorAll('.cell');
  cells.forEach((c, i) => {
    const v = G.grid[i], given = !!G.puzzle[i];
    c.className = 'cell' + (v ? ' filled' : ' empty') + (given ? ' given' : '') + (bad.has(i) ? ' bad' : '') + (i === sel ? ' sel' : '') + (peerSet.has(i) ? ' peer' : '') + (G.hinted[i] ? ' hinted' : '');
    if (v) c.style.setProperty('--col', `var(--c${v})`); else c.style.removeProperty('--col');
    const nm = !v && G.notes ? G.notes[i] : 0;
    c.classList.toggle('noted', !!nm);
    c.innerHTML = v ? svg(v) : nm ? noteDots(nm, n) : '';
    const r = Math.floor(i / n) + 1, col = (i % n) + 1;
    c.setAttribute('aria-label', `Row ${r} column ${col}: ${v ? COLOR_NAMES[v] : 'empty'}${given ? ' (fixed)' : ''}`);
  });
  const counts = Array(n + 1).fill(0); G.grid.forEach(v => counts[v]++);
  document.querySelectorAll('.swatch').forEach(s => {
    const v = +s.dataset.v; s.classList.toggle('brush', v === brush); s.classList.toggle('done', counts[v] >= n);
    s.querySelector('.cnt').textContent = n - counts[v];
  });
  $('#hud-moves').textContent = G.moves; $('#hud-hints').textContent = G.hints; $('#hud-mist').textContent = G.mistakes;
  $('#hud-time').textContent = fmt(elapsed());
  $('#btn-undo').disabled = !G.hist.length || G.done;
  $('#btn-hint').disabled = $('#btn-erase').disabled = $('#btn-notes').disabled = G.done;
  $('#btn-notes').setAttribute('aria-pressed', notesOn); $('#btn-notes').classList.toggle('on', notesOn);
  document.body.classList.toggle('notes-on', notesOn);
}

function noteDots(mask, n) {
  const k = n <= 4 ? 2 : 3; let h = `<span class="notes" style="--k:${k}">`;
  for (let v = 1; v <= n; v++) h += mask & (1 << v) ? `<i style="--col:var(--c${v})"></i>` : '<i class="off"></i>';
  return h + '</span>';
}

// Pencil marks: toggle a tiny color dot in an empty tile. Not scored, not in undo history.
function toggleNote(i, v) {
  if (G.done || i < 0 || G.puzzle[i] || G.grid[i]) return;
  G.notes[i] ^= (1 << v); tone(SCALE[v] * 2, 0.06, 'sine', 0.05); render(false); persist();
}
function clearPeerNotes(i, v) {
  if (!G.notes) return; const bit = 1 << v;
  for (const p of peers(G.mode)[i]) G.notes[p] &= ~bit;
  G.notes[i] = 0;
}

function place(i, v) {
  if (G.done || i < 0 || G.puzzle[i]) return;
  if (!G.seen) markSeen(G);
  const prev = G.grid[i];
  if (prev === v) return;
  G.hist.push({ i, prev, places: G.places[i], hinted: G.hinted[i] });
  G.grid[i] = v; G.moves++;
  if (v) {
    G.places[i]++; clearPeerNotes(i, v);
    const bad = conflicts(G.grid, G.mode);
    if (bad.has(i)) { G.mistakes++; sfx.clash(); if (navigator.vibrate) navigator.vibrate(40); } else sfx.place(v);
  } else sfx.erase();
  render(false);
  const cell = $(`#board .cell[data-i="${i}"]`); cell?.classList.add('pop');
  persist();
  if (isSolved(G.grid, G.puzzle, G.mode)) win();
}

function undo() {
  if (G.done || !G.hist.length) return;
  const h = G.hist.pop();
  G.grid[h.i] = h.prev; G.places[h.i] = h.places; G.hinted[h.i] = h.hinted; G.moves++;
  sel = h.i; sfx.erase(); render(false); persist();
}

function hint() {
  if (G.done) return;
  const n = G.grid.length;
  let target = -1;
  if (sel >= 0 && !G.puzzle[sel] && G.grid[sel] !== G.solution[sel]) target = sel;
  if (target < 0) { const wrong = [...Array(n).keys()].filter(i => G.grid[i] && G.grid[i] !== G.solution[i]); if (wrong.length) target = wrong[0]; }
  if (target < 0) {
    // pick the empty cell with the fewest candidates (most "logical" next step)
    const P = peers(G.mode); let best = 99;
    for (let i = 0; i < n; i++) if (!G.grid[i]) { const used = new Set(P[i].map(p => G.grid[p]).filter(Boolean)); const c = MODES[G.mode].size - used.size; if (c < best) { best = c; target = i; } }
  }
  if (target < 0) return;
  G.hist.push({ i: target, prev: G.grid[target], places: G.places[target], hinted: G.hinted[target] });
  G.grid[target] = G.solution[target]; clearPeerNotes(target, G.solution[target]); G.hinted[target] = true; G.hints++; G.moves++; sel = target;
  sfx.hint(); render(false); persist();
  toast(`Hint: that tile is ${COLOR_NAMES[G.solution[target]]} (+15s)`);
  if (isSolved(G.grid, G.puzzle, G.mode)) win();
}

function restart() {
  if (G.done && G.play === 'daily') return toast('Today’s daily is solved — try Free play!');
  if (!confirm('Restart this puzzle? Your timer keeps running.')) return;
  G.grid = G.puzzle.slice(); G.places = G.puzzle.map(() => 0); G.hinted = G.puzzle.map(() => false); G.notes = G.puzzle.map(() => 0); G.hist = []; sel = -1;
  render(false); persist();
}

function randomSeed() { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0]; }

// ---------- win ----------
function shareGrid() {
  const n = MODES[G.mode].size; let out = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) { const i = r * n + c; out += G.puzzle[i] ? '⬜' : G.hinted[i] ? '🟦' : G.places[i] <= 1 ? '🟩' : '🟨'; }
    out += '\n';
  }
  return out;
}
function shareText() {
  const m = MODES[G.mode], r = G.result || {};
  const head = G.play === 'daily' ? `Prismku #${G.number} 🌈 ${m.label} ${m.size}×${m.size}` : `Prismku 🌈 ${m.label} ${m.size}×${m.size}`;
  return `${head}\n⏱ ${fmt(G.elapsed)} · 💡${G.hints} · ⚡${G.mistakes}${r.score ? ` · ${r.score} pts` : ''}\n${shareGrid()}${CONFIG.siteUrl.replace('https://', '')}`;
}

function confetti() {
  const fx = $('#fx');
  for (let k = 0; k < 70; k++) {
    const s = document.createElement('i'); s.className = 'spark';
    s.style.left = (40 + Math.random() * 20) + 'vw'; s.style.top = '45vh';
    s.style.background = `var(--c${1 + (k % 9)})`;
    s.style.setProperty('--x', (Math.random() * 100 - 50) + 'vw'); s.style.setProperty('--y', (Math.random() * 80 - 30) + 'vh');
    s.style.animationDelay = (Math.random() * 0.25) + 's';
    fx.appendChild(s); setTimeout(() => s.remove(), 2200);
  }
}

async function win() {
  G.elapsed = elapsed(); G.done = true; sel = -1; brush = 0;
  // Stamp the solve on the server right away (even before a nickname exists) so a later submit is timed to now.
  if (!ARCHIVE) G.finishP = api('play/finish', { playerId: player.id, mode: G.mode, seed: G.seed, grid: gridToString(G.grid) }).catch(() => {});
  const score = computeScore(G.mode, G.elapsed, G.hints, G.mistakes);
  G.result = { score, local: true };
  render(false); $('#board').classList.add('win'); sfx.win(); confetti();
  // local bests
  const bests = store.get('bests', {});
  const b = bests[G.mode] || { score: 0, fastest: null, solved: 0 };
  const pb = score > b.score;
  bests[G.mode] = { score: Math.max(b.score, score), fastest: b.fastest ? Math.min(b.fastest, G.elapsed) : G.elapsed, solved: b.solved + 1 };
  store.set('bests', bests);
  if (G.play === 'daily') { const d = store.get('dailies', {}); d[`${G.day}:${G.mode}`] = { score, t: G.elapsed }; store.set('dailies', d); }
  G.result.personalBest = pb;
  persist();
  setTimeout(() => showWin(), 900);
  if (!ARCHIVE && player.nick) submit();
}

async function ensureRegistered(nick) {
  if (player.registered && nick === player.nick) return true;
  const r = await api('player', { id: player.id, secret: player.secret, nickname: nick });
  if (!r.ok) { toast(r.error || 'Could not save nickname'); return false; }
  player.nick = r.nickname; player.registered = true; store.set('player', player, 'pk.');
  return true;
}

async function submit() {
  if (!G.done || G.result?.submitted || ARCHIVE) return;
  if (!await ensureRegistered(player.nick)) return;
  const body = { playerId: player.id, secret: player.secret, mode: G.mode, seed: G.seed, daily: G.play === 'daily', day: G.day,
    grid: gridToString(G.grid), timeMs: Math.round(G.elapsed), moves: G.moves, hints: G.hints, mistakes: G.mistakes, version: CONFIG.version };
  await G.finishP;
  let r = await api('scores', body);
  if (r.status === 401) { player.registered = false; if (await ensureRegistered(player.nick)) r = await api('scores', body); }
  if (r.ok) {
    Object.assign(G.result, { submitted: true, score: r.score, dailyRank: r.dailyRank, streak: r.streak, allTimeRecord: r.allTimeRecord, achievements: r.achievements, ranked: r.ranked !== false, clock: r.clock || null, serverMs: r.timeMs });
    persist();
    if ($('#dlg').open && $('#win-extra')) $('#win-extra').innerHTML = winExtra();
    (r.achievements || []).forEach((a, k) => setTimeout(() => toast('🏅 ' + a.title), 1200 + k * 2800));
    loadCommunity();
  } else if (r.status === 409) { G.result.submitted = true; persist(); }
  else toast(r.error || 'Score not submitted');
}

function winExtra() {
  const r = G.result || {};
  if (ARCHIVE) return `<p class="tip">Archive version — scores aren’t submitted. <a href="/">Play the latest Prismku</a>.</p>`;
  if (!player.nick) return `<p>Add your name to the leaderboard:</p><input type="text" id="nick" maxlength="16" placeholder="Nickname" autocomplete="nickname"><div class="row"><button class="btn primary" data-act="save-nick">Save & submit</button></div>`;
  if (!r.submitted) return `<p class="tip">Submitting score…</p>`;
  if (r.ranked === false) return `<p class="tip">⚠️ Unranked: the server couldn’t confirm when this board was first shown, so this time stays off the leaderboards.</p>`;
  return `${r.clock === 'clock' && r.serverMs ? `<p class="tip">⏱ Timed by the server clock: ${fmt(r.serverMs)} (${r.score} pts)</p>` : ''}<p style="text-align:center">${r.dailyRank ? `🏆 Daily rank <b>#${r.dailyRank}</b>` : 'Score saved'}${r.streak ? ` · 🔥 ${r.streak}-day streak` : ''}${r.allTimeRecord ? ' · ✨ New all-time record!' : ''}</p>
    ${(r.achievements || []).map(a => `<div class="ach">🏅 ${esc(a.title)}</div>`).join('')}`;
}

function showWin() {
  const m = MODES[G.mode], r = G.result || {};
  openDlg(`<button class="btn x" data-act="close" aria-label="Close">✕</button>
    <h3>${G.play === 'daily' ? `Daily #${G.number} solved!` : 'Solved!'} 🌈</h3>
    <div class="big">${r.score} pts</div>
    <div class="kv"><div><b>${fmt(G.elapsed)}</b>time</div><div><b>${G.moves}</b>moves</div><div><b>${G.hints}</b>hints</div><div><b>${G.mistakes}</b>clashes</div></div>
    ${r.personalBest ? `<p style="text-align:center">⭐ Personal best for ${m.label}!</p>` : ''}
    <div id="win-extra">${winExtra()}</div>
    <pre class="share-pre">${esc(shareText())}</pre>
    <div class="row"><button class="btn primary" data-act="share">Share result</button>
    <button class="btn" data-act="share-img">🖼️ Image</button>
    <button class="btn" data-act="next">${G.play === 'daily' ? 'Free play' : 'Next puzzle'}</button>
    <button class="btn" data-act="lb">Leaderboard</button>
    <button class="btn" data-act="feedback">💬 Feedback</button></div>`);
}

function showDoneState() {
  $('#tip').innerHTML = G.play === 'daily' ? `Solved in ${fmt(G.elapsed)} — new daily in <span id="countdown"></span>. <a href="#" data-act="showwin">See result</a>` : 'Solved! Tap ✨ New for another.';
  updateCountdown();
}
function updateCountdown() {
  const el = $('#countdown'); if (!el) return;
  const next = Date.parse(utcDay()) + 86400000; el.textContent = fmt(next - Date.now());
}
setInterval(updateCountdown, 1000);

// Copy text with the async Clipboard API, falling back to a hidden textarea + execCommand (older / restricted browsers).
async function copyText(text) {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch {}
  try {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    ($('#dlg').open ? $('#dlg') : document.body).appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}
function flashBtn(act, label) {
  const b = document.querySelector(`#dlg [data-act="${act}"]`); if (!b) return;
  b.dataset.label ??= b.textContent; b.textContent = label; clearTimeout(b._t); b._t = setTimeout(() => { b.textContent = b.dataset.label; }, 2200);
}
function selectSharePre() { const pre = document.querySelector('#dlg .share-pre'); if (!pre) return; const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }

async function share() {
  const text = shareText();
  if (navigator.share && matchMedia('(pointer:coarse)').matches) {
    try { await navigator.share({ text }); return; } catch (e) { if (e?.name === 'AbortError') return; }
  }
  if (await copyText(text)) { flashBtn('share', '✓ Copied!'); toast('Result copied — paste it anywhere!'); }
  else { selectSharePre(); flashBtn('share', 'Press Ctrl+C'); toast('Result selected above — press Ctrl+C (⌘C) to copy'); }
}

// ---------- result card image (share / download a 1080×1080 PNG) ----------
const CARD_HUES = ['#ff3b47', '#ff8c1a', '#ffd60a', '#2ecc71', '#19d3c5', '#2f7bff', '#9b5cff', '#ff5cc8'];
function resultCard() {
  const S = 1080, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const x = cv.getContext('2d'), m = MODES[G.mode], n = m.size, r = G.result || {};
  const font = (w, px) => `${w} ${px}px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif`;
  x.fillStyle = '#120b2e'; x.fillRect(0, 0, S, S);
  CARD_HUES.forEach((c, k) => { const g = x.createRadialGradient((k * 0.37 % 1) * S, ((k * 0.61 + 0.2) % 1) * S, 0, (k * 0.37 % 1) * S, ((k * 0.61 + 0.2) % 1) * S, S * 0.45); g.addColorStop(0, c + '40'); g.addColorStop(1, c + '00'); x.fillStyle = g; x.fillRect(0, 0, S, S); });
  const rb = x.createLinearGradient(0, 0, S, 0); CARD_HUES.forEach((c, k) => rb.addColorStop(k / (CARD_HUES.length - 1), c));
  x.strokeStyle = rb; x.lineWidth = 16; x.strokeRect(8, 8, S - 16, S - 16);
  x.textAlign = 'center'; x.fillStyle = rb; x.font = font(800, 92); x.fillText('Prismku', S / 2, 130);
  x.fillStyle = '#f6f1ff'; x.font = font(600, 44);
  x.fillText(G.play === 'daily' ? `Daily #${G.number} · ${m.label} ${n}×${n}` : `${m.label} ${n}×${n} · Free play`, S / 2, 200);
  // spoiler-free board: tile state only (given / solved first try / fixed / hint), tinted along a rainbow diagonal
  const B = 600, ox = (S - B) / 2, oy = 240, cell = B / n, gap = Math.max(4, cell * 0.08);
  for (let rr = 0; rr < n; rr++) for (let c = 0; c < n; c++) {
    const i = rr * n + c, hue = CARD_HUES[Math.floor(((rr + c) / (2 * n - 1)) * CARD_HUES.length) % CARD_HUES.length];
    const given = !!G.puzzle[i], hinted = !!G.hinted[i], retry = !given && !hinted && G.places[i] > 1;
    x.globalAlpha = given ? 0.28 : 1; x.fillStyle = hinted ? '#8ab6ff' : hue;
    const px = ox + c * cell + gap / 2, py = oy + rr * cell + gap / 2, w = cell - gap;
    x.beginPath(); x.roundRect ? x.roundRect(px, py, w, w, w * 0.18) : x.rect(px, py, w, w); x.fill();
    x.globalAlpha = 1;
    if (retry || hinted) { x.fillStyle = 'rgba(18,11,46,.85)'; x.font = font(800, w * 0.45); x.textBaseline = 'middle'; x.fillText(hinted ? '💡' : '↺', px + w / 2, py + w / 2 + 2); x.textBaseline = 'alphabetic'; }
  }
  x.fillStyle = '#f6f1ff'; x.font = font(700, 50);
  x.fillText(`⏱ ${fmt(G.elapsed)}   💡 ${G.hints}   ⚡ ${G.mistakes}${r.score ? `   ${r.score} pts` : ''}`, S / 2, 940);
  x.fillStyle = '#ffd60a'; x.font = font(700, 40); x.fillText('Can you beat it? prismku.com', S / 2, 1010);
  return new Promise(res => cv.toBlob(res, 'image/png'));
}
async function shareImage() {
  const blob = await resultCard(); if (!blob) return toast('Could not draw the image');
  const name = `prismku-${G.play === 'daily' ? `daily-${G.number}` : 'free'}-${G.mode}.png`;
  const file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
  if (file && navigator.canShare?.({ files: [file] }) && matchMedia('(pointer:coarse)').matches) {
    try { await navigator.share({ files: [file], text: shareText() }); return; } catch (e) { if (e?.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  flashBtn('share-img', '✓ Saved!'); toast('Result card saved — attach it anywhere!');
}

// ---------- dialogs ----------
function openDlg(html) { const d = $('#dlg'); dlgState.token = (dlgState.token || 0) + 1; $('#dlg-body').innerHTML = html; if (!d.open) { try { d.showModal(); } catch { d.setAttribute('open', ''); } } setHold('dlg', true); }
function closeDlg() { const d = $('#dlg'); dlgState.token = (dlgState.token || 0) + 1; try { d.close(); } catch {} d.removeAttribute('open'); setHold('dlg', false); }
$('#dlg').addEventListener('close', () => setHold('dlg', false)); // Esc / form close
// Close buttons are handled in the capture phase so no other dialog handler (or a pending async render) can swallow the tap (issue #1).
document.addEventListener('click', e => { if (e.target.closest?.('#dlg [data-act="close"]')) { e.preventDefault(); e.stopPropagation(); closeDlg(); } }, true);

async function showLeaderboard(mode = G.mode, scope = 'daily', day = serverDay) {
  const dayLabel = day === serverDay ? 'Today' : day.slice(5).replace('-', '/');
  openDlg(`<button class="btn x" data-act="close" aria-label="Close">✕</button><h3>🏆 Leaderboards</h3>
    <div class="seg" style="margin-bottom:8px">${['daily', 'week', 'all'].map(s => `<button data-lbscope="${s}" class="${s === scope ? 'on' : ''}">${{ daily: dayLabel, week: 'This week', all: 'All time' }[s]}</button>`).join('')}</div>
    <div class="seg" style="margin-bottom:10px">${MODE_KEYS.map(k => `<button data-lbmode="${k}" class="${k === mode ? 'on' : ''}">${MODES[k].label}</button>`).join('')}</div>
    <div id="lb-body"><p class="tip">Loading…</p></div>`);
  dlgState.lbmode = mode; dlgState.lbscope = scope; dlgState.lbday = day;
  const token = dlgState.token;
  const r = await api(`leaderboard?mode=${mode}&scope=${scope}&me=${player.id}${scope === 'daily' ? `&day=${day}` : ''}`);
  const body = $('#lb-body');
  // Ignore stale responses: the player switched tab/mode or closed the dialog while this was loading.
  if (!body || token !== dlgState.token || !$('#dlg').open) return;
  if (!r.ok) { body.innerHTML = '<p class="tip">Leaderboard unavailable right now.</p>'; return; }
  body.innerHTML = r.entries.length ? `<table class="lb"><tbody>${r.entries.map(e => `<tr class="${e.me ? 'me' : ''}"><td class="n">${e.rank}</td><td>${esc(e.nickname)}${e.hints ? ' <small title="hints used">💡' + e.hints + '</small>' : ''}</td><td class="s">${fmt(e.timeMs)}</td><td class="s"><b>${e.score}</b></td></tr>`).join('')}</tbody></table>`
    : '<p class="tip">No scores yet — be the first to light it up!</p>';
}

async function showMe() {
  const bests = store.get('bests', {});
  openDlg(`<button class="btn x" data-act="close" aria-label="Close">✕</button><h3>👤 You</h3>
    <label>Nickname<input type="text" id="nick" maxlength="16" value="${esc(player.nick || '')}" placeholder="Nickname"></label>
    <div class="row"><button class="btn" data-act="save-nick">Save nickname</button></div>
    <h4>Personal bests</h4>
    <table class="lb"><tbody>${MODE_KEYS.map(k => { const b = bests[k]; return `<tr><td>${MODES[k].label} ${MODES[k].size}×${MODES[k].size}</td><td class="s">${b ? fmt(b.fastest) : '—'}</td><td class="s"><b>${b ? b.score : '—'}</b></td><td class="s">${b ? b.solved + '×' : ''}</td></tr>`; }).join('')}</tbody></table>
    <h4>Achievements</h4><div id="ach-list"><p class="tip">${player.registered ? 'Loading…' : 'Solve a puzzle with a nickname to start earning badges.'}</p></div>
    <h4>Theme</h4><div class="themes">${THEMES.filter(t => !t.pro || CONFIG.pro.enabled).map(t => `<button class="btn ${settings.theme === t.key ? 'primary' : ''}" data-theme="${t.key}" ${t.pro ? 'data-pro="1"' : ''}>${t.label}${t.pro ? ' ✦ Pro' : ''}</button>`).join('')}</div>`);
  if (player.registered && !ARCHIVE) {
    const r = await api('me?id=' + player.id); const el = $('#ach-list'); if (!el) return;
    el.innerHTML = r.ok && r.achievements?.length ? r.achievements.map(a => `<div class="ach">🏅 ${esc(a.title)}</div>`).join('') : '<p class="tip">No badges yet — go get one!</p>';
  }
}

function showHelp() {
  openDlg(`<button class="btn x" data-act="close" aria-label="Close">✕</button><h3>How to play</h3>
    <p>Fill every empty tile with a color so <b>no color repeats in any row or column</b> (and not inside a bold box when the board has them).</p>
    <p>👉 Tap a tile, then tap a color. Or tap a color first to “paint” several tiles.<br>⌨️ Keyboard: arrows to move, 1–9 for colors, Backspace to erase, Z to undo, H for a hint, N for notes.</p>
    <p>✏️ <b>Notes</b> mode turns colors into tiny pencil dots so you can track which colors could still fit a tile. Placing a color wipes that dot from its row, column and box. (Keyboard: N, or Shift+number.)</p>
    <p>💡 Hints reveal one correct tile (+15s). ⚡ A clash (duplicate color) adds +3s — clashing tiles pulse red.</p>
    <p>⏱ The clock waits while you read this. Once you’ve seen a board it keeps running until it’s solved, even with a menu open or the tab in the background.</p>
    <p>🌍 The <b>Daily</b> is the same puzzle for everyone. Share your grid: ⬜ given · 🟩 first try · 🟨 changed · 🟦 hint.</p>
    <p>◐ turns on symbols for colorblind-friendly play. 💬 sends us feedback or a bug report.</p>
    <div class="row"><button class="btn primary" data-act="close">Let’s play</button></div>`);
}

// ---------- feedback ----------
function feedbackContext() {
  const c = { version: CONFIG.version, ua: navigator.userAgent, screen: `${screen.width}x${screen.height}@${devicePixelRatio || 1}`,
    viewport: `${innerWidth}x${innerHeight}`, url: location.pathname, theme: settings.theme, cb: settings.cb, lang: navigator.language };
  if (G) Object.assign(c, { mode: G.mode, seed: G.seed, daily: G.play === 'daily', day: G.day, solved: !!G.done, elapsedMs: Math.round(elapsed()) });
  if (player.registered) c.playerId = player.id;
  return c;
}
function showFeedback(type = 'bug') {
  const ctx = feedbackContext();
  openDlg(`<button class="btn x" data-act="close" aria-label="Close">✕</button><h3>💬 Feedback & bug reports</h3>
    <p class="tip" style="text-align:left">Found a bug or have an idea? Tell us — every ticket is read.</p>
    <div class="seg" id="fb-type" role="radiogroup" aria-label="Type">${[['bug', '🐞 Bug'], ['idea', '💡 Idea'], ['other', '✉️ Other']].map(([k, l]) => `<button type="button" role="radio" data-fbtype="${k}" class="${k === type ? 'on' : ''}" aria-checked="${k === type}">${l}</button>`).join('')}</div>
    <label class="fb-field">Message <span class="fb-count" id="fb-count">0/1000</span><textarea id="fb-msg" maxlength="1000" placeholder="What happened? What did you expect?"></textarea></label>
    <label class="fb-field">Email (optional, only if you want a reply)<input type="email" id="fb-contact" maxlength="254" autocomplete="email" placeholder="you@example.com"></label>
    <label class="hp" aria-hidden="true">Website<input type="text" id="fb-website" tabindex="-1" autocomplete="off"></label>
    <p class="fb-ctx">Attached automatically: v${esc(ctx.version)}${ctx.mode ? ` · ${esc(MODES[ctx.mode].label)} · seed ${ctx.seed}${ctx.daily ? ' (daily)' : ''}` : ''} · ${esc(ctx.viewport)} · your browser’s user agent.</p>
    <div class="row"><button class="btn primary" data-act="fb-send" id="fb-send">Send</button><button class="btn" data-act="close">Cancel</button></div>`);
  dlgState.fbtype = type;
  const msg = $('#fb-msg'); msg.addEventListener('input', () => { $('#fb-count').textContent = `${msg.value.length}/1000`; }); msg.focus();
}
async function sendFeedback() {
  const message = $('#fb-msg').value.trim(), contact = $('#fb-contact').value.trim();
  if (message.length < 5) { toast('Please write a little more'); return; }
  const btn = $('#fb-send'); btn.disabled = true; btn.textContent = 'Sending…';
  const r = await api('feedback', { type: dlgState.fbtype || 'bug', message, contact, website: $('#fb-website').value, context: feedbackContext() }).catch(() => ({ ok: false }));
  if (r.ok) { closeDlg(); toast(r.id ? `Thanks! Ticket #${r.id} received 💜` : 'Thanks! 💜', 3500); }
  else { btn.disabled = false; btn.textContent = 'Send'; toast(r.error || 'Could not send — please try again'); }
}

// ---------- community ----------
async function loadCommunity() {
  if (ARCHIVE) { $('#community').hidden = true; return; }
  const r = await api('stats').catch(() => null);
  if (!r?.ok) { $('#community').hidden = true; return; }
  $('#community').hidden = false;
  if (r.day) { serverDay = r.day; }
  $('#community-stats').innerHTML = `<div><b>${r.gamesToday}</b><span>solves today</span></div><div><b>${r.players}</b><span>players</span></div><div><b>${r.gamesTotal}</b><span>all-time solves</span></div>`;
  $('#highlights').innerHTML = (r.highlights || []).map(h => `<li>✨ ${esc(h.message)}</li>`).join('') || '<li>Be the first highlight of the day!</li>';
}

// ---------- events ----------
function selectCell(i) {
  if (G.done) return;
  if (brush && !G.puzzle[i]) { if (notesOn && !G.grid[i]) toggleNote(i, brush); else place(i, G.grid[i] === brush ? 0 : brush); sel = i; render(false); return; }
  sel = sel === i ? -1 : i; render(false);
}
$('#board-wrap').addEventListener('click', e => { const c = e.target.closest('.cell'); if (c) selectCell(+c.dataset.i); });
$('#palette').addEventListener('click', e => {
  const s = e.target.closest('.swatch'); if (!s || G.done) return; const v = +s.dataset.v;
  if (sel >= 0 && !G.puzzle[sel]) { if (notesOn && !G.grid[sel]) toggleNote(sel, v); else place(sel, G.grid[sel] === v ? 0 : v); }
  else { brush = brush === v ? 0 : v; render(false); if (brush) toast(`Painting ${COLOR_NAMES[v]} — tap tiles`, 1500); }
});
$('#btn-notes').onclick = () => { notesOn = !notesOn; render(false); toast(notesOn ? '✏️ Notes on — colors become pencil dots' : 'Notes off', 1500); };
$('#btn-undo').onclick = undo; $('#btn-hint').onclick = hint; $('#btn-restart').onclick = restart;
$('#btn-erase').onclick = () => { if (sel < 0) return toast('Select a tile to erase'); if (!G.grid[sel] && G.notes?.[sel]) { G.notes[sel] = 0; render(false); persist(); } else place(sel, 0); };
$('#btn-new').onclick = () => { store.del(progressKey('free', G.mode)); newGame('free', G.mode, randomSeed()); };
$('#btn-board').onclick = () => showLeaderboard();
$('#btn-me').onclick = showMe; $('#btn-help').onclick = showHelp; $('#btn-feedback').onclick = () => showFeedback();
$('#btn-sound').onclick = () => { settings.sound = !settings.sound; saveSettings(); applySettings(); if (settings.sound) tone(880); };
$('#btn-cb').onclick = () => { settings.cb = !settings.cb; saveSettings(); applySettings(); toast(settings.cb ? 'Symbols on' : 'Symbols off', 1200); };
document.querySelectorAll('[data-play]').forEach(b => b.onclick = () => startMode(b.dataset.play, G.mode));
$('#diff').innerHTML = MODE_KEYS.map(k => `<button role="tab" data-mode="${k}">${MODES[k].label} <small>${MODES[k].size}×${MODES[k].size}</small></button>`).join('');
$('#diff').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) startMode(G.play, b.dataset.mode); });

function startMode(play, mode) {
  persist();
  if (play === 'free') { const s = store.get(progressKey('free', mode)); newGame('free', mode, s ? s.seed : randomSeed()); }
  else newGame('daily', mode);
  if (!G.done) $('#tip').textContent = 'Tap a tile, then a color. No color may repeat in a row, column or bold box.';
}

$('#dlg').addEventListener('click', async e => {
  if (e.target === $('#dlg')) return closeDlg();
  const a = e.target.closest('[data-act]')?.dataset.act;
  const fbt = e.target.closest('[data-fbtype]');
  if (fbt) { dlgState.fbtype = fbt.dataset.fbtype; document.querySelectorAll('[data-fbtype]').forEach(b => { b.classList.toggle('on', b === fbt); b.setAttribute('aria-checked', b === fbt); }); return; }
  const lbm = e.target.closest('[data-lbmode]'), lbs = e.target.closest('[data-lbscope]'), th = e.target.closest('[data-theme]');
  if (lbm) return showLeaderboard(lbm.dataset.lbmode, dlgState.lbscope, dlgState.lbday);
  if (lbs) return showLeaderboard(dlgState.lbmode, lbs.dataset.lbscope, dlgState.lbday);
  if (th) { if (th.dataset.pro && CONFIG.pro.enabled && !store.get('pro', false, 'pk.')) { if (CONFIG.pro.checkoutUrl) location.href = CONFIG.pro.checkoutUrl; return; } settings.theme = th.dataset.theme; saveSettings(); applySettings(); return showMe(); }
  if (a === 'share') share();
  if (a === 'share-img') shareImage();
  if (a === 'feedback') showFeedback();
  if (a === 'fb-send') sendFeedback();
  if (a === 'lb') showLeaderboard(G.mode, G.play === 'daily' ? 'daily' : 'all', G.play === 'daily' ? G.day : serverDay);
  if (a === 'next') { closeDlg(); if (G.play === 'daily') startMode('free', G.mode); else $('#btn-new').click(); }
  if (a === 'save-nick') {
    const nick = $('#nick').value.trim(); if (!nick) return;
    if (await ensureRegistered(nick)) { toast('Nickname saved: ' + player.nick); if (G.done && !G.result?.submitted) { await submit(); if ($('#win-extra')) $('#win-extra').innerHTML = winExtra(); } }
  }
});
document.addEventListener('click', e => {
  if (e.target.closest('[data-act="showwin"]')) { e.preventDefault(); showWin(); }
  if (!e.target.closest('#dlg') && e.target.closest('[data-act="feedback"]')) { e.preventDefault(); showFeedback(); }
});

document.addEventListener('keydown', e => {
  if ($('#dlg').open || e.target.tagName === 'INPUT' || !G) return;
  const n = MODES[G.mode].size;
  const k = e.key;
  if (k.startsWith('Arrow')) {
    e.preventDefault(); if (sel < 0) sel = 0;
    else { const r = Math.floor(sel / n), c = sel % n; const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k]; sel = ((r + d[0] + n) % n) * n + ((c + d[1] + n) % n); }
    render(false);
  } else if (/^[1-9]$/.test(k) && +k <= n) { if (sel >= 0) { if ((notesOn || e.shiftKey) && !G.grid[sel]) toggleNote(sel, +k); else place(sel, +k); } }
  else if (/^Digit[1-9]$/.test(e.code) && e.shiftKey && +e.code.slice(5) <= n) { if (sel >= 0 && !G.grid[sel]) toggleNote(sel, +e.code.slice(5)); }
  else if (k.toLowerCase() === 'n') $('#btn-notes').click();
  else if (k === 'Backspace' || k === 'Delete' || k === '0') { if (sel >= 0) place(sel, 0); }
  else if (k.toLowerCase() === 'z') undo();
  else if (k.toLowerCase() === 'h') hint();
  else if (k === 'Escape') { sel = -1; brush = 0; render(false); }
});

// twinkle: random filled tile blinks now and then
setInterval(() => {
  if (!G || document.hidden) return;
  const filled = [...document.querySelectorAll('#board .cell.filled')]; if (!filled.length) return;
  const c = filled[Math.floor(Math.random() * filled.length)]; c.classList.add('twinkle'); setTimeout(() => c.classList.remove('twinkle'), 800);
}, 1800);

function applySettings() {
  document.body.classList.toggle('cb', settings.cb);
  document.body.className = document.body.className.replace(/theme-\w+/g, '').trim();
  if (settings.theme !== 'classic') document.body.classList.add('theme-' + settings.theme);
  $('#btn-sound').textContent = settings.sound ? '🔊' : '🔇';
  $('#btn-sound').setAttribute('aria-pressed', settings.sound); $('#btn-cb').setAttribute('aria-pressed', settings.cb);
}

function monetization() {
  if (CONFIG.ads.enabled && !ARCHIVE) { const s = $('#ad-slot'); s.hidden = false; s.textContent = 'Advertisement'; /* provider script is injected here once configured */ }
  if (CONFIG.tips.enabled && CONFIG.tips.url) { const s = $('#tip-slot'); s.hidden = false; s.innerHTML = `<a href="${esc(CONFIG.tips.url)}" target="_blank" rel="noopener">💖 ${esc(CONFIG.tips.label)}</a>`; }
}

// ---------- boot ----------
(async function boot() {
  $('#ver').textContent = 'v' + CONFIG.version;
  if (ARCHIVE) {
    const b = $('#archive-banner'); b.hidden = false;
    b.innerHTML = `🕰️ You’re playing the archived ${esc(CONFIG.version)} edition of Prismku. <a href="/" style="color:#fff"><b>Play the latest →</b></a>`;
    document.querySelectorAll('a.brand').forEach(a => a.href = '/');
  }
  applySettings(); monetization();
  try { const h = await api('health'); if (h.ok && h.day) serverDay = h.day; } catch {}
  const mode = MODES[settings.mode] ? settings.mode : 'easy';
  startMode(settings.play === 'free' ? 'free' : 'daily', mode);
  loadCommunity();
  if (location.hash === '#feedback') showFeedback();
  else if (!store.get('seenHelp', false, 'pk.')) { store.set('seenHelp', true, 'pk.'); showHelp(); }
  if ('serviceWorker' in navigator && !ARCHIVE && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
  window.__prismku = { get G() { return G; }, place, hint, toast, resultCard, elapsed: () => (G ? elapsed() : 0) };
})();
