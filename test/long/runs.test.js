// Long runs: the two kernels stay identical over thousands of generations,
// and the scenarios the page tells about end the way it says.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../../src/sim/engine.js';

const runTo = (params, gens, seed = 'genome', useWasm = true) => {
  const e = new Engine({ seed, params, useWasm });
  while (e.gen < gens && !e.extinct) e.step();
  return e;
};

test('WebAssembly and JavaScript stay identical over 5,000 generations', () => {
  const a = runTo({ K: 400 }, 5000, 'long', true);
  const b = runTo({ K: 400 }, 5000, 'long', false);
  assert.equal(a.kernel, 'wasm');
  assert.equal(a.hash(), b.hash());
  assert.deepEqual(a.history, b.history);
});

test('100 adults melt down (Learn, chapter 5)', () => {
  const e = runTo({ K: 100 }, 6000);
  assert.ok(e.extinct, 'extinct');
  assert.ok(e.gen > 1000 && e.gen < 4000, `after ${e.gen} generations`);
});

test('clones die out, the same genome with sex lives (chapter 6)', () => {
  const clones = runTo({ mode: 'asex' }, 3000);
  assert.ok(clones.extinct && clones.gen < 2500, `clones lasted ${clones.gen}`);
  const sex = runTo({}, 2500);
  assert.ok(!sex.extinct && sex.last.survival > 0.5);
});

test('U = 4 dies out; with 50 young per mother it lives (chapter 7)', () => {
  const many = runTo({ U: 4 }, 3000);
  assert.ok(many.extinct && many.gen < 1500, `U = 4 lasted ${many.gen}`);
  const fish = runTo({ U: 4, F: 50 }, 2000);
  assert.ok(!fish.extinct && fish.N === fish.params.K);
});

test('U = 3 dies out; synergy or competition rescue it', () => {
  const base = runTo({ U: 3 }, 8000);
  assert.ok(base.extinct, `U = 3 lasted ${base.gen}`);
  for (const extra of [{ epistasis: 2 }, { competition: 1 }]) {
    const e = runTo({ U: 3, ...extra }, 8000);
    assert.ok(!e.extinct && e.N === e.params.K, JSON.stringify(extra));
  }
});
