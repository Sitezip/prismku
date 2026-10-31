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
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), ms); }

// ---------- game state ----------
let G = null;          // current game
let sel = -1;          // selected cell
let brush = 0;         // armed color
let serverDay = utcDay();
let tick = null;

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
      places: p.puzzle.map(() => 0), hinted: p.puzzle.map(() => false), moves: 0, hints: 0, mistakes: 0, elapsed: 0, done: false, hist: [], result: null };
  }
  G.key = key; G.startedAt = performance.now();
  sel = -1; brush = 0;
  settings.play = play; settings.mode = mode; saveSettings();
  render(true); startTimer();
  if (G.done) showDoneState();
}
function restore(s) { const p = generate(s.mode, s.seed); return { ...s, puzzle: p.puzzle, solution: p.solution }; }
function persist() {
  if (!G) return;
  const { puzzle, solution, startedAt, key, ...rest } = G;
  rest.elapsed = elapsed(); rest.hist = rest.hist.slice(-200);
  store.set(G.key, rest);
}
function elapsed() { return G.done ? G.elapsed : G.elapsed + (document.hidden ? 0 : performance.now() - G.startedAt); }
function startTimer() {
  clearInterval(tick);
  tick = setInterval(() => { if (G && !G.done) $('#hud-time').textContent = fmt(elapsed()); }, 250);
}
document.addEventListener('visibilitychange', () => {
  if (!G || G.done) return;
  if (document.hidden) { G.elapsed += performance.now() - G.startedAt; persist(); }
  else G.startedAt = performance.now();
});
window.addEventListener('pagehide', persist);

// ---------- rendering ----------
function render(full) {
  const m = MODES[G.mode], n = m.size, board = $('#board');
  if (full) {
    board.innerHTML = '';
    const gap = n >= 9 ? 3 : n >= 6 ? 4 : 6;
    board.style.setProperty('--gap', gap + 'px'); board.style.setProperty('--n', n);
    board.style.setProperty('--cr', (n >= 9 ? 6 : n >= 6 ? 9 : 12) + 'px');
    board.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
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
    c.innerHTML = v ? svg(v) : '';
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
  $('#btn-hint').disabled = $('#btn-erase').disabled = G.done;
}

function place(i, v) {
  if (G.done || i < 0 || G.puzzle[i]) return;
  const prev = G.grid[i];
  if (prev === v) return;
  G.hist.push({ i, prev, places: G.places[i], hinted: G.hinted[i] });
  G.grid[i] = v; G.moves++;
  if (v) {
    G.places[i]++;
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
  G.grid[target] = G.solution[target]; G.hinted[target] = true; G.hints++; G.moves++; sel = target;
  sfx.hint(); render(false); persist();
  toast(`Hint: that tile is ${COLOR_NAMES[G.solution[target]]} (+15s)`);
  if (isSolved(G.grid, G.puzzle, G.mode)) win();
}

function restart() {
  if (G.done && G.play === 'daily') return toast('Today’s daily is solved — try Free play!');
  if (!confirm('Restart this puzzle? Your timer keeps running.')) return;
  G.grid = G.puzzle.slice(); G.places = G.puzzle.map(() => 0); G.hinted = G.puzzle.map(() => false); G.hist = []; sel = -1;
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
  let r = await api('scores', body);
  if (r.status === 401) { player.registered = false; if (await ensureRegistered(player.nick)) r = await api('scores', body); }
  if (r.ok) {
    Object.assign(G.result, { submitted: true, score: r.score, dailyRank: r.dailyRank, streak: r.streak, allTimeRecord: r.allTimeRecord, achievements: r.achievements });
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
  return `<p style="text-align:center">${r.dailyRank ? `🏆 Daily rank <b>#${r.dailyRank}</b>` : 'Score saved'}${r.streak ? ` · 🔥 ${r.streak}-day streak` : ''}${r.allTimeRecord ? ' · ✨ New all-time record!' : ''}</p>
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
    <button class="btn" data-act="next">${G.play === 'daily' ? 'Free play' : 'Next puzzle'}</button>
    <button class="btn" data-act="lb">Leaderboard</button></div>`);
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

async function share() {
  const text = shareText();
  try {
    if (navigator.share && matchMedia('(pointer:coarse)').matches) { await navigator.share({ text }); return; }
    await navigator.clipboard.writeText(text); toast('Result copied — paste it anywhere!');
  } catch { toast('Copy the result above to share'); }
}

// ---------- dialogs ----------
function openDlg(html) { const d = $('#dlg'); $('#dlg-body').innerHTML = html; if (!d.open) d.showModal(); }
function closeDlg() { $('#dlg').close(); }

async function showLeaderboard(mode = G.mode, scope = 'daily') {
  openDlg(`<button class="btn x" data-act="close" aria-label="Close">✕</button><h3>🏆 Leaderboards</h3>
    <div class="seg" style="margin-bottom:8px">${['daily', 'week', 'all'].map(s => `<button data-lbscope="${s}" class="${s === scope ? 'on' : ''}">${{ daily: 'Today', week: 'This week', all: 'All time' }[s]}</button>`).join('')}</div>
    <div class="seg" style="margin-bottom:10px">${MODE_KEYS.map(k => `<button data-lbmode="${k}" class="${k === mode ? 'on' : ''}">${MODES[k].label}</button>`).join('')}</div>
    <div id="lb-body"><p class="tip">Loading…</p></div>`);
  $('#dlg').dataset.lbmode = mode; $('#dlg').dataset.lbscope = scope;
  const r = await api(`leaderboard?mode=${mode}&scope=${scope}&me=${player.id}`);
  const body = $('#lb-body'); if (!body) return;
  if (!r.ok) { body.innerHTML = '<p class="tip">Leaderboard unavailable right now.</p>'; return; }
  body.innerHTML = r.entries.length ? `<table class="lb"><tbody>${r.entries.map(e => `<tr class="${e.me ? 'me' : ''}"><td class="n">${e.rank}</td><td>${esc(e.nickname)}</td><td class="s">${fmt(e.timeMs)}</td><td class="s"><b>${e.score}</b></td></tr>`).join('')}</tbody></table>`
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
    <p>👉 Tap a tile, then tap a color. Or tap a color first to “paint” several tiles.<br>⌨️ Keyboard: arrows to move, 1–9 for colors, Backspace to erase, Z to undo, H for a hint.</p>
    <p>💡 Hints reveal one correct tile (+15s). ⚡ A clash (duplicate color) adds +3s — clashing tiles pulse red.</p>
    <p>🌍 The <b>Daily</b> is the same puzzle for everyone. Share your grid: ⬜ given · 🟩 first try · 🟨 changed · 🟦 hint.</p>
    <p>◐ turns on symbols for colorblind-friendly play.</p>
    <div class="row"><button class="btn primary" data-act="close">Let’s play</button></div>`);
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
  if (brush && !G.puzzle[i]) { place(i, G.grid[i] === brush ? 0 : brush); sel = i; render(false); return; }
  sel = sel === i ? -1 : i; render(false);
}
$('#board').addEventListener('click', e => { const c = e.target.closest('.cell'); if (c) selectCell(+c.dataset.i); });
$('#palette').addEventListener('click', e => {
  const s = e.target.closest('.swatch'); if (!s || G.done) return; const v = +s.dataset.v;
  if (sel >= 0 && !G.puzzle[sel]) { place(sel, G.grid[sel] === v ? 0 : v); }
  else { brush = brush === v ? 0 : v; render(false); if (brush) toast(`Painting ${COLOR_NAMES[v]} — tap tiles`, 1500); }
});
$('#btn-undo').onclick = undo; $('#btn-hint').onclick = hint; $('#btn-restart').onclick = restart;
$('#btn-erase').onclick = () => { if (sel >= 0) place(sel, 0); else toast('Select a tile to erase'); };
$('#btn-new').onclick = () => { store.del(progressKey('free', G.mode)); newGame('free', G.mode, randomSeed()); };
$('#btn-board').onclick = () => showLeaderboard();
$('#btn-me').onclick = showMe; $('#btn-help').onclick = showHelp;
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
  const lbm = e.target.closest('[data-lbmode]'), lbs = e.target.closest('[data-lbscope]'), th = e.target.closest('[data-theme]');
  if (lbm) return showLeaderboard(lbm.dataset.lbmode, $('#dlg').dataset.lbscope);
  if (lbs) return showLeaderboard($('#dlg').dataset.lbmode, lbs.dataset.lbscope);
  if (th) { if (th.dataset.pro && CONFIG.pro.enabled && !store.get('pro', false, 'pk.')) { if (CONFIG.pro.checkoutUrl) location.href = CONFIG.pro.checkoutUrl; return; } settings.theme = th.dataset.theme; saveSettings(); applySettings(); return showMe(); }
  if (a === 'close') closeDlg();
  if (a === 'share') share();
  if (a === 'lb') showLeaderboard(G.mode, G.play === 'daily' ? 'daily' : 'all');
  if (a === 'next') { closeDlg(); if (G.play === 'daily') startMode('free', G.mode); else $('#btn-new').click(); }
  if (a === 'save-nick') {
    const nick = $('#nick').value.trim(); if (!nick) return;
    if (await ensureRegistered(nick)) { toast('Nickname saved: ' + player.nick); if (G.done && !G.result?.submitted) { await submit(); if ($('#win-extra')) $('#win-extra').innerHTML = winExtra(); } }
  }
});
document.addEventListener('click', e => { if (e.target.closest('[data-act="showwin"]')) { e.preventDefault(); showWin(); } });

document.addEventListener('keydown', e => {
  if ($('#dlg').open || e.target.tagName === 'INPUT' || !G) return;
  const n = MODES[G.mode].size;
  const k = e.key;
  if (k.startsWith('Arrow')) {
    e.preventDefault(); if (sel < 0) sel = 0;
    else { const r = Math.floor(sel / n), c = sel % n; const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k]; sel = ((r + d[0] + n) % n) * n + ((c + d[1] + n) % n); }
    render(false);
  } else if (/^[1-9]$/.test(k) && +k <= n) { if (sel >= 0) place(sel, +k); }
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
  if (!store.get('seenHelp', false, 'pk.')) { store.set('seenHelp', true, 'pk.'); showHelp(); }
  if ('serviceWorker' in navigator && !ARCHIVE && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
  window.__prismku = { get G() { return G; }, place, hint };
})();
