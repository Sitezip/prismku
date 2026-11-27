// Printable sheets (2026-11-18 "Print & Play"): build worksheets of Rainbow Sudoku boards for paper.
// Pure helpers, unit-tested in test/printable.test.mjs. The page lives at /printable/ (pages/printable.html).
import { MODES, generate, hashString } from './puzzle.js';
import { encodeChallenge } from './challenge.js';

export const PRINT_COUNTS = [1, 2, 4, 6];
export const PRINT_STYLES = ['color', 'crayon'];

// Read and clamp the sheet options from a query string, so every sheet is a shareable, reproducible URL.
export function sheetOptions(search) {
  const q = new URLSearchParams(search || '');
  const mode = MODES[q.get('size')] ? q.get('size') : 'easy';
  const n = parseInt(q.get('n'), 10);
  const count = PRINT_COUNTS.includes(n) ? n : 4;
  const style = PRINT_STYLES.includes(q.get('style')) ? q.get('style') : 'color';
  const answers = q.get('answers') !== '0';
  const raw = String(q.get('seed') || '').toLowerCase().replace(/[^0-9a-z]/g, '').slice(0, 12);
  return { mode, count, style, answers, seed: raw || null };
}

export function sheetQuery({ mode, count, style, answers, seed }) {
  return `?size=${mode}&n=${count}&style=${style}&answers=${answers ? 1 : 0}&seed=${seed}`;
}

export function randomSheetSeed(rnd = Math.random) {
  return Math.floor(rnd() * 36 ** 6).toString(36).padStart(6, '0');
}

// Board k of a sheet: a deterministic seed, the puzzle, its answer, and a link to play that exact board online.
export function buildSheet({ mode, count, seed }) {
  const out = [];
  for (let k = 0; k < count; k++) {
    const s = hashString(`prismku-print-${seed}-${mode}-${k}`);
    const g = generate(mode, s);
    out.push({ number: k + 1, mode, size: g.size, box: MODES[mode].box, seed: g.seed, puzzle: g.puzzle, solution: g.solution,
      code: encodeChallenge({ mode, seed: g.seed }) });
  }
  return out;
}
