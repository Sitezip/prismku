import assert from 'node:assert/strict';
import { MODE_KEYS } from '../client/puzzle.js';
import {
  modesCleared, isFullRainbow, nextRainbowMode, rainbowShareLine, streakShareText,
} from '../client/rainbow.js';

const day = '2026-11-06';
assert.deepEqual(modesCleared({}, day), []);
assert.equal(isFullRainbow({}, day), false);
assert.equal(nextRainbowMode({}, day), 'easy');
assert.equal(rainbowShareLine([]), '');

const partial = { [`${day}:easy`]: { score: 1 }, [`${day}:medium`]: { score: 1 } };
assert.deepEqual(modesCleared(partial, day), ['easy', 'medium']);
assert.equal(isFullRainbow(partial, day), false);
assert.equal(nextRainbowMode(partial, day), 'hard');
assert.equal(rainbowShareLine(modesCleared(partial, day)), '🌈 2/4 · Easy · Medium');

const full = Object.fromEntries(MODE_KEYS.map(k => [`${day}:${k}`, { score: 1 }]));
assert.deepEqual(modesCleared(full, day), [...MODE_KEYS]);
assert.equal(isFullRainbow(full, day), true);
assert.equal(nextRainbowMode(full, day), null);
assert.equal(rainbowShareLine(modesCleared(full, day)), '🌈 Full Rainbow · Easy · Medium · Hard · Expert');

// Other days do not count toward today's rainbow.
assert.equal(isFullRainbow({ '2026-11-05:easy': 1, '2026-11-05:medium': 1, '2026-11-05:hard': 1, '2026-11-05:expert': 1 }, day), false);

assert.equal(
  streakShareText({ number: 7, cur: 3, best: 5, siteUrl: 'https://prismku.com' }),
  'Prismku Daily #7 🌈\n🔥 3-day streak · ✨ best 5\nprismku.com',
);
assert.equal(streakShareText({ number: 1, cur: 0, best: 0 }).includes('0-day streak'), true);

console.log('rainbow tests passed');
