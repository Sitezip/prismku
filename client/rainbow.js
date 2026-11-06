// Full Rainbow helpers — clear Easy + Medium + Hard + Expert on the same daily day.
// Pure (no DOM) so npm test covers the share lines and completion checks.

import { MODE_KEYS, MODES } from './puzzle.js';

/** Modes of `day` already stored in the local `dailies` map (`YYYY-MM-DD:mode` → result). */
export function modesCleared(dailies, day, modes = MODE_KEYS) {
  return modes.filter(k => !!dailies?.[`${day}:${k}`]);
}

/** True once every mode for that day has a local daily solve. */
export function isFullRainbow(dailies, day, modes = MODE_KEYS) {
  return modes.length > 0 && modes.every(k => !!dailies?.[`${day}:${k}`]);
}

/** First unsolved mode for the tip "try Hard next", or null when the rainbow is full. */
export function nextRainbowMode(dailies, day, modes = MODE_KEYS) {
  return modes.find(k => !dailies?.[`${day}:${k}`]) || null;
}

/**
 * Share line for today's rainbow progress.
 * Full: "🌈 Full Rainbow · Easy · Medium · Hard · Expert"
 * Partial: "🌈 2/4 · Easy · Medium"
 * Empty: ""
 */
export function rainbowShareLine(cleared, modes = MODE_KEYS) {
  if (!cleared?.length) return '';
  const labels = cleared.map(k => MODES[k]?.label || k);
  if (cleared.length >= modes.length) return `🌈 Full Rainbow · ${labels.join(' · ')}`;
  return `🌈 ${cleared.length}/${modes.length} · ${labels.join(' · ')}`;
}

/** Spoiler-free streak brag for the calendar Share streak button. */
export function streakShareText({ number, cur, best, siteUrl = 'https://prismku.com' }) {
  const host = String(siteUrl || 'https://prismku.com').replace(/^https?:\/\//, '');
  const n = Number(number) || 0;
  const c = Math.max(0, Number(cur) || 0);
  const b = Math.max(0, Number(best) || 0);
  return `Prismku Daily #${n} 🌈\n🔥 ${c}-day streak · ✨ best ${b}\n${host}`;
}
