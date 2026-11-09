import assert from 'node:assert/strict';
import { paceState, beatBy } from '../client/pace.js';
assert.equal(paceState(1000, null), 'none');
assert.equal(paceState(1000, 0), 'none');
assert.equal(paceState(10000, 120000), 'ahead');
assert.equal(paceState(110000, 120000), 'close');   // 10s left, under the 15s margin
assert.equal(paceState(120000, 120000), 'close');   // tying is still on pace
assert.equal(paceState(120001, 120000), 'behind');
assert.equal(paceState(5000, 20000), 'ahead');       // margin is 15% (3s) on a 20s best
assert.equal(paceState(17500, 20000), 'close');
assert.equal(beatBy(90000, 100000), 10000);
assert.equal(beatBy(100000, 100000), 0);
assert.equal(beatBy(110000, 100000), 0);
assert.equal(beatBy(5000, null), 0);
console.log('pace tests ok');
