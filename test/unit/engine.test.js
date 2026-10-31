import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, popcnt, CLASSES } from '../../src/sim/engine.js';
import { normalize, DEFAULTS } from '../../src/sim/params.js';

test('popcnt counts bits', () => {
  assert.equal(popcnt(0), 0);
  assert.equal(popcnt(-1), 32);
  assert.equal(popcnt(0x80000001 | 0), 2);
  assert.equal(popcnt(0x0f0f0f0f), 16);
});

test('settings are kept in range and the genome splits evenly', () => {
  const p = normalize({ K: 3, genes: 5000, chromosomes: 7, U: -1, mode: 'x' });
  assert.equal(p.K, 50);
  assert.equal(p.U, 0);
  assert.equal(p.mode, 'sex');
  assert.equal(p.genes % (32 * p.chromosomes), 0);
  assert.deepEqual(normalize({}), { ...DEFAULTS });
});

test('a population starts perfect and full', () => {
  const e = new Engine({ seed: 's', params: { K: 200 } });
  assert.equal(e.N, 200);
  assert.equal(e.last.meanN, 0);
  assert.equal(e.last.brokenAll, 0);
  assert.equal(e.last.survival, 1);
  assert.equal(e.classGenes.reduce((a, b) => a + b, 0), e.L);
  assert.equal(e.classGenes.length, CLASSES.length);
});

test('the WebAssembly and JavaScript kernels give exactly the same run', () => {
  const cases = [
    { K: 300 },
    { K: 200, mode: 'nocross' },
    { K: 200, mode: 'asex', U: 0.5 },
    { K: 200, epistasis: 1.5, repair: 0.5 },
    { K: 150, competition: 2, h: 0.5 },
    { K: 200, males: 2, epistasis: 0.5 },
    { K: 150, males: 1, competition: 1, U: 2 },
    { K: 150, dfe: 'strong', U: 2, F: 20, crossovers: 3 },
  ];
  for (const params of cases) {
    const a = new Engine({ seed: 'twin', params, useWasm: true });
    const b = new Engine({ seed: 'twin', params, useWasm: false });
    assert.equal(b.kernel, 'js');
    a.run(120);
    b.run(120);
    assert.equal(a.hash(), b.hash(), JSON.stringify(params));
    assert.deepEqual(a.last, b.last, JSON.stringify(params));
    assert.deepEqual([a.rng.a, a.rng.b, a.rng.c, a.rng.d], [b.rng.a, b.rng.b, b.rng.c, b.rng.d]);
  }
});

test('the same seed gives the same run, another seed another', () => {
  const run = (seed) => {
    const e = new Engine({ seed, params: { K: 200 } });
    e.run(80);
    return e.hash();
  };
  assert.equal(run('a'), run('a'));
  assert.notEqual(run('a'), run('b'));
});

test('per-gene counts agree with the genomes and the summaries', () => {
  const e = new Engine({ seed: 'c', params: { K: 150 } });
  e.run(300);
  const c = e.counts();
  const { N, W, geno, L } = e;
  let total = 0;
  let fixed = 0;
  for (let g = 0; g < L; g++) {
    let n = 0;
    for (let k = 0; k < 2 * N; k++) if (geno[k * W + (g >> 5)] & (1 << (g & 31))) n++;
    assert.equal(c[g], n);
    total += n;
    if (n === 2 * N) fixed++;
  }
  assert.ok(Math.abs(total / N - e.last.meanN) < 1e-9);
  assert.equal(fixed, e.last.brokenAll);
  const f = e.frequencies();
  assert.ok(Math.abs(f.reduce((a, b) => a + b, 0) * 2 - total / N) < 1e-3);
});

test('damage and survival respond as expected', () => {
  const e = new Engine({ seed: 'd', params: { K: 300, dfe: 'strong' } });
  e.run(400);
  assert.ok(e.last.meanN > 30 && e.last.meanN < 120, `copies ${e.last.meanN}`);
  assert.ok(e.last.survival > 0.25 && e.last.survival < 0.5, `survival ${e.last.survival}`);
  const none = new Engine({ seed: 'd', params: { K: 100, U: 0 } });
  none.run(50);
  assert.equal(none.last.meanN, 0);
  assert.equal(none.last.survival, 1);
});

test('a population that cannot pay dies out and stays dead', () => {
  const e = new Engine({ seed: 'e', params: { K: 100, dfe: 'strong', U: 5, F: 4 } });
  e.run(2000);
  assert.ok(e.extinct);
  assert.equal(e.N, 0);
  const g = e.gen;
  e.run(10);
  assert.equal(e.gen, g);
});

test('selection on males: the alias table draws fathers in proportion to w^m', () => {
  const e = new Engine({ seed: 'm', params: { K: 200, males: 2, U: 2, dfe: 'strong' } });
  e.run(100);
  const nM = e.sex.subarray(0, e.N).reduce((a, x) => a + x, 0);
  let k = 0;
  for (let i = 0; i < e.N; i++) if (e.sex[i] === 1) e.mal[k++] = i;
  e.buildFathers(nM);
  // the chance of each male under the alias method, against w^m
  const got = new Float64Array(nM);
  for (let j = 0; j < nM; j++) {
    const keep = e.thr[j] / 4294967296;
    got[j] += keep / nM;
    got[e.alias[j]] += (1 - keep) / nM;
  }
  const want = Array.from({ length: nM }, (_, j) => Math.exp(-2 * e.dmg[e.mal[j]]));
  const total = want.reduce((a, b) => a + b, 0);
  for (let j = 0; j < nM; j++) assert.ok(Math.abs(got[j] - want[j] / total) < 1e-9, `male ${j}`);
  assert.ok(Math.max(...want) / Math.min(...want) > 1.5, 'the males differ');
});

test('selection on males leaves the default run untouched when off and lowers the damage when on', () => {
  const plain = new Engine({ seed: 'm2', params: { K: 300, dfe: 'strong' } });
  const off = new Engine({ seed: 'm2', params: { K: 300, dfe: 'strong', males: 0 } });
  const on = new Engine({ seed: 'm2', params: { K: 300, dfe: 'strong', males: 4 } });
  plain.run(600);
  off.run(600);
  on.run(600);
  assert.equal(plain.hash(), off.hash());
  assert.ok(on.last.meanN < 0.7 * plain.last.meanN, `${on.last.meanN} vs ${plain.last.meanN}`);
});

test('settings can change during a run', () => {
  const e = new Engine({ seed: 'f', params: { K: 200 } });
  e.run(20);
  assert.equal(e.setParams({ U: 2, K: 999 }), true, 'U is live');
  assert.equal(e.params.U, 2);
  assert.equal(e.params.K, 200, 'K needs a new start');
  assert.equal(e.hitsDamage, 1);
  e.setParams({ mode: 'asex' });
  e.run(5);
  assert.ok(e.N > 0);
  e.setParams({ mode: 'sex', competition: 1 });
  assert.ok([...e.sex.subarray(0, e.N)].some((x) => x === 1), 'clones get two sexes back');
  e.run(5);
  assert.ok(e.N > 0 && !e.extinct);
  assert.equal(e.setParams({ males: 1.5 }), true, 'selection on males is live');
  e.run(5);
  assert.ok(e.N > 0 && !e.extinct);
  assert.equal(e.setParams({ U: 2 }), false, 'no change, no entry');
  assert.equal(e.changes.length, 4);
});
