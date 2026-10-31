import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wright, pfix, synergyBalance, genomeForecast, copiesAtBalance, loadSurvival, persists, haighN0, maleSurvival, maleCopies } from '../../src/sim/theory.js';
import { gammaCdf, familyEffects, DFE_PRESETS } from '../../src/sim/dfe.js';
import { classOf } from '../../src/sim/engine.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);

test('Wright: neutral genes follow a beta distribution', () => {
  const u = 1e-4;
  const v = 1e-5;
  for (const N of [100, 2000]) close(wright(N, u, v, 0, 0.25).q, u / (u + v), 1e-6, `N ${N}`);
});

test('Wright: strongly selected genes sit near u/(h·s)', () => {
  const u = 1 / 10240;
  const g = wright(20000, u, u / 10, 0.05, 0.25);
  close(g.q / (u / 0.0125), 1, 0.03);
  close(g.logw, -2 * u, 2e-6, 'load per gene is about 2u');
});

test('Kimura: neutral and additive fixation probabilities', () => {
  close(pfix(500, 0, 0.5), 1 / 1000, 1e-12);
  const S = 2; // 4N·h·s for N = 500, h = 0.5, s = 0.002
  close(pfix(500, 0.002, 0.5), (Math.exp(0.002) - 1) / (Math.exp(S) - 1), 1e-6);
  assert.ok(pfix(500, 0.02, 0.5) < 1e-8);
});

test('Haldane–Muller and friends', () => {
  close(loadSurvival(1), 0.36788, 1e-5);
  assert.equal(copiesAtBalance(1, 0.25, 0.05), 80);
  assert.equal(persists(10, 1), true);
  assert.equal(persists(10, 2), false);
  close(haighN0(2000, 0.1, 0.25, 0.05), 2000 * Math.exp(-8), 1e-9);
});

test('selection on males divides the price exponent by 1 + m/2', () => {
  close(maleSurvival(1, 0), Math.exp(-1), 1e-12);
  close(maleSurvival(1, 2), Math.exp(-0.5), 1e-12);
  close(maleCopies(1, 0.25, 0.05, 2), 40, 1e-9);
});

test('synergy: no synergy gives e^-U, synergy raises survival', () => {
  const d = -Math.log(1 - 0.0125);
  close(synergyBalance(1, d, 0).survival, Math.exp(-1), 1e-6);
  assert.ok(synergyBalance(1, d, 2).survival > 0.45);
});

test('the gamma effects match measured human estimates', () => {
  const { shape, mean } = DFE_PRESETS.human;
  close(gammaCdf(1e-3, shape, mean), 0.496, 0.005);
  close(gammaCdf(1e-2, shape, mean), 0.764, 0.005);
  const s = familyEffects(160, DFE_PRESETS.human, 'x');
  const t = familyEffects(160, DFE_PRESETS.human, 'y');
  assert.deepEqual([...s].sort(), [...t].sort(), 'the seed only shuffles the effects');
  close(s.reduce((a, b) => a + b, 0) / 160, mean, 0.002);
});

test('the genome forecast adds up its classes', () => {
  const effects = Array.from(familyEffects(160, DFE_PRESETS.human, 'genome'));
  const f = genomeForecast({ N: 2000, U: 1, repair: 0.1, h: 0.25, effects, classOf });
  let copies = 0;
  for (const c of f.byClass.values()) copies += c.copies;
  close(copies, f.copies, 1e-6);
  close(f.survival, 0.445, 0.01);
  assert.ok(f.byClass.get(0).copies < 50 && f.byClass.get(3).copies > 2500);
});
