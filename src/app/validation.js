// The Validation tab: runs of the real simulation set against what
// population genetics predicts. Each experiment is a seeded run, so its
// numbers are the same everywhere; the page shows the results computed when
// it was built and can run any of them again.

import { Engine, CLASSES, classOf, dfeOf } from '../sim/engine.js';
import { DFE_PRESETS, familyEffects } from '../sim/dfe.js';
import { DEFAULTS } from '../sim/params.js';
import { copiesAtBalance, genomeForecast, haighN0, loadSurvival, maleSurvival, pfix, synergyBalance, wright } from '../sim/theory.js';

const pct = (x, d = 1) => `${(100 * x).toFixed(d)} %`;
const num = (x, d = 0) =>
  Number(x)
    .toFixed(d)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// What each experiment records while it runs.
function averager(from) {
  return {
    from,
    n: 0,
    survival: 0,
    copies: 0,
    each(e) {
      if (e.gen <= this.from) return;
      this.n++;
      this.survival += e.last.survival;
      this.copies += e.last.meanN;
    },
    result() {
      return { survival: this.survival / this.n, copies: this.copies / this.n };
    },
  };
}

// Substitutions (genes newly broken in every copy) counted after `from`,
// and the number Kimura's fixation probability predicts for the same
// generations: every intact gene gets 2N·u new broken copies a generation,
// each of which takes over with chance Pfix.
function substitutions(from) {
  return {
    from,
    start: 0,
    expected: 0,
    pf: 0,
    each(e) {
      if (e.gen === 1) this.pf = pfix(e.params.K, e.sFam[0], e.params.h);
      if (e.gen === this.from) this.start = e.last.subsDamage;
      if (e.gen <= this.from) return;
      const u = e.params.U / (2 * e.L);
      this.expected += (e.L - e.last.brokenAll) * 2 * e.last.N * u * this.pf;
    },
    result(e) {
      return { count: e.last.subsDamage - this.start, expected: this.expected, pfix: this.pf };
    },
  };
}

export const EXPERIMENTS = [
  {
    id: 'severe',
    secs: 19, // measured on a 2.1 GHz server core
    label: 'Every gene severe (s = 5 %)',
    params: { dfe: 'strong' },
    gens: 3000,
    track: () => averager(1500),
  },
  {
    id: 'mild',
    secs: 26, // measured on a 2.1 GHz server core
    label: 'Every gene mild (s = 0.5 %)',
    params: { dfe: 'mild' },
    gens: 6000,
    track: () => averager(3000),
  },
  {
    id: 'additive',
    secs: 16, // measured on a 2.1 GHz server core
    label: 'Severe genes, half dominant (h = 0.5)',
    params: { dfe: 'strong', h: 0.5 },
    gens: 3000,
    track: () => averager(1500),
  },
  {
    id: 'u2',
    secs: 1, // measured on a 2.1 GHz server core
    label: 'Two damaging mutations per newborn',
    params: { dfe: 'strong', U: 2 },
    gens: 3000,
    track: () => averager(0),
  },
  {
    id: 'u12',
    secs: 23, // measured on a 2.1 GHz server core
    label: '1.2 damaging mutations per newborn',
    params: { dfe: 'strong', U: 1.2 },
    gens: 3000,
    track: () => averager(1500),
  },
  {
    id: 'neutral',
    secs: 4, // measured on a 2.1 GHz server core
    label: 'Genes that do not matter (s = 0.0001 %), 500 places',
    params: { dfe: 'customFixed', fixedS: 1e-6, K: 500 },
    gens: 5000,
    track: () => averager(4999),
  },
  {
    id: 'neutralSubs',
    secs: 24, // measured on a 2.1 GHz server core
    label: 'Genes that do not matter, rare mutations (U = 0.05), 500 places',
    params: { dfe: 'customFixed', fixedS: 1e-6, K: 500, U: 0.05, h: 0.5 },
    gens: 35000,
    track: () => substitutions(5000),
  },
  {
    id: 'weakSubs',
    secs: 28, // measured on a 2.1 GHz server core
    label: 'Slightly harmful genes (s = 0.2 %, h = 0.5), rare mutations, 500 places',
    params: { dfe: 'customFixed', fixedS: 0.002, K: 500, U: 0.05, h: 0.5 },
    gens: 35000,
    track: () => substitutions(5000),
  },
  {
    id: 'clones',
    secs: 5, // measured on a 2.1 GHz server core
    label: 'Clones: severe genes, U = 0.1, no sex',
    params: { dfe: 'strong', U: 0.1, mode: 'asex' },
    gens: 3000,
    track: () => ({
      start: 0,
      each(e) {
        if (e.gen === 300) this.start = e.last.minN;
      },
      result(e) {
        return { min0: this.start, min1: e.last.minN, survival: e.last.survival };
      },
    }),
  },
  {
    id: 'sexual',
    secs: 7, // measured on a 2.1 GHz server core
    label: 'Same, with sex',
    params: { dfe: 'strong', U: 0.1 },
    gens: 3000,
    track: () => ({
      start: 0,
      each(e) {
        if (e.gen === 300) this.start = e.last.minN;
      },
      result(e) {
        return { min0: this.start, min1: e.last.minN, survival: e.last.survival };
      },
    }),
  },
  {
    id: 'synergy',
    secs: 14, // measured on a 2.1 GHz server core
    label: 'Severe genes, damage that hurts more and more (synergy 2)',
    params: { dfe: 'strong', epistasis: 2 },
    gens: 3000,
    track: () => averager(1500),
  },
  {
    id: 'males',
    secs: 13, // measured on a 2.1 GHz server core
    label: 'Severe genes, healthier males father more young (selection on males 2)',
    params: { dfe: 'strong', males: 2 },
    gens: 3000,
    track: () => averager(1500),
  },
  {
    id: 'default',
    secs: 161, // measured on a 2.1 GHz server core
    label: 'The default population, one million years (40,000 generations)',
    params: {},
    gens: 40000,
    track: () => ({
      ...averager(36000),
      result(e) {
        const c = e.counts();
        const byClass = CLASSES.map(() => 0);
        for (let g = 0; g < e.L; g++) byClass[e.cls[g >> 5]] += c[g];
        return {
          survival: this.survival / this.n,
          copies: this.copies / this.n,
          byClass: byClass.map((x) => x / e.N),
          fixed: e.last.brokenAll,
        };
      },
    }),
  },
  {
    id: 'repeat',
    secs: 6, // measured on a 2.1 GHz server core
    label: 'The default population twice with one seed, once with another (500 generations)',
    params: {},
    gens: 500,
    seeds: ['check-repeat', 'check-repeat', 'check-other'],
    track: () => ({
      each() {},
      result(e) {
        return { hash: e.hash() };
      },
    }),
  },
];

const EXP = Object.fromEntries(EXPERIMENTS.map((x) => [x.id, x]));

// The effects of the default genome (they depend on the seed), for the
// forecast.
function defaultEffects(seed) {
  return Array.from(familyEffects(DEFAULTS.genes / 32, dfeOf(DEFAULTS), seed));
}

const sOf = (preset) => DFE_PRESETS[preset].s;
const L0 = 5120;
const u0 = (U) => U / (2 * L0);

// Each check: what theory says, the run that tests it, and how close counts
// as a match.
export const CHECKS = [
  {
    id: 'load',
    title: 'The price of mutation is e^−U',
    uses: ['severe'],
    predict: () => loadSurvival(1),
    measure: (r) => r.severe.survival,
    pass: (sim, pred) => Math.abs(sim - pred) <= 0.02,
    show: pct,
    tolerance: '±2 points',
    why: 'Haldane (1937) and Muller (1950): at balance every new damaging mutation is removed by one death or failed birth, so with U = 1 new mutation per newborn the share of young that survive their genes settles at e^−1 = 36.8 %.',
    source: 'Haldane 1937, Am. Nat. 71:337; Muller 1950, Am. J. Hum. Genet. 2:111',
  },
  {
    id: 'loadMild',
    title: 'The price does not depend on how harmful each gene is',
    uses: ['mild'],
    predict: () => loadSurvival(1),
    measure: (r) => r.mild.survival,
    pass: (sim, pred) => Math.abs(sim - pred) <= 0.025,
    show: pct,
    tolerance: '±2.5 points',
    why: 'Ten times milder genes, same share of young lost: a milder mutation lingers longer and so is carried by more of the young before it is removed, and the two effects cancel. (Wright’s distribution, which adds drift, gives 37.8 %.)',
    source: 'Haldane 1937; Crow 1970, in Biomathematics 1:128',
  },
  {
    id: 'copiesSevere',
    title: 'Broken copies per genome: U/(h·s)',
    uses: ['severe'],
    predict: () => copiesAtBalance(1, 0.25, sOf('strong')),
    measure: (r) => r.severe.copies,
    pass: (sim, pred) => Math.abs(sim / pred - 1) <= 0.07,
    show: (x) => num(x, 1),
    tolerance: '±7 %',
    why: 'Each broken copy lowers survival by h·s = 1.25 % and so lasts about 1/(h·s) = 80 generations. With one new one per newborn per generation, a genome carries about 80. (Drift trims this a little; Wright’s distribution gives 78.)',
    source: 'Crow 1970; Kimura & Maruyama 1966, Genetics 54:1337',
  },
  {
    id: 'copiesMild',
    title: 'Milder genes: more broken copies, as Wright predicts',
    uses: ['mild'],
    predict: () => 2 * L0 * wright(2000, u0(1), u0(1) * 0.1, sOf('mild'), 0.25).q,
    measure: (r) => r.mild.copies,
    pass: (sim, pred) => Math.abs(sim / pred - 1) <= 0.07,
    show: (x) => num(x, 0),
    tolerance: '±7 %',
    why: 'U/(h·s) would give 800, but at s = 0.5 % drift starts to matter (4N·h·s = 10): by chance some genes are clean in everyone for a while. Wright’s stationary distribution for mutation, selection and drift gives 684.',
    source: 'Wright 1937, PNAS 23:307',
  },
  {
    id: 'dominance',
    title: 'More dominant damage: fewer broken copies, same price',
    uses: ['additive'],
    predict: () => copiesAtBalance(1, 0.5, sOf('strong')),
    measure: (r) => r.additive.copies,
    pass: (sim, pred, r) => Math.abs(sim / pred - 1) <= 0.07 && Math.abs(r.additive.survival - loadSurvival(1)) <= 0.02,
    show: (x) => num(x, 1),
    detail: (r) => `survival of the young ${pct(r.additive.survival)} (e^−U = 36.8 %)`,
    tolerance: '±7 %, survival ±2 points',
    why: 'With h = 0.5 a single broken copy costs twice as much, so it is removed twice as fast: U/(h·s) = 40 copies. The price stays e^−U.',
    source: 'Crow 1970',
  },
  {
    id: 'persist',
    title: 'Enough young to pay the price, or extinction',
    uses: ['u2', 'u12'],
    predict: () => 'U = 2 dies out, U = 1.2 lives',
    measure: (r) => `U = 2 ${r.u2.extinct ? `died out after ${num(r.u2.gen)} generations` : 'lived'}; U = 1.2 ${r.u12.extinct ? 'died out' : `lived (survival ${pct(r.u12.survival)})`}`,
    pass: (sim, pred, r) => r.u2.extinct && !r.u12.extinct,
    show: (x) => x,
    tolerance: 'both outcomes',
    why: 'Each female has F = 10 young, so at least 2 in 10 must survive for the population to replace itself. With U = 2 only e^−2 = 13.5 % survive at balance; with U = 1.2, 30 %.',
    source: 'Muller 1950; Kondrashov 1988, Nature 336:435',
  },
  {
    id: 'decay',
    title: 'Genes nobody needs decay at the mutation rate',
    uses: ['neutral'],
    predict: () => {
      const u = u0(1);
      const v = u * 0.1;
      return (u / (u + v)) * (1 - Math.exp(-(u + v) * 5000));
    },
    measure: (r) => r.neutral.copies / (2 * L0),
    pass: (sim, pred) => Math.abs(sim - pred) <= 0.01,
    show: pct,
    tolerance: '±1 point',
    why: 'With no selection, broken copies just pile up: each intact copy breaks at rate u = 1/10,240 per generation (and is repaired ten times more rarely), so after 5,000 generations 37.8 % of copies are broken, heading for 91 %. This is how pseudogenes form.',
    source: 'Haldane 1933; Li, Gojobori & Nei 1981, Nature 292:237',
  },
  {
    id: 'neutralRate',
    title: 'Neutral substitution rate = mutation rate',
    uses: ['neutralSubs'],
    predict: (r) => r.neutralSubs.expected,
    measure: (r) => r.neutralSubs.count,
    pass: (sim, pred) => Math.abs(sim / pred - 1) <= 0.12,
    show: (x) => num(x, 0),
    detail: () => 'genes broken in every copy, generations 5,000 to 35,000',
    tolerance: '±12 %',
    why: 'Kimura: a new neutral mutation takes over with chance 1/(2N), and 2N·u of them arise each generation, so neutral genes turn over at rate u, whatever the population size.',
    source: 'Kimura 1968, Nature 217:624',
  },
  {
    id: 'weakRate',
    title: 'Slightly harmful mutations take over too, more rarely',
    uses: ['weakSubs'],
    predict: (r) => r.weakSubs.expected,
    measure: (r) => r.weakSubs.count,
    pass: (sim, pred) => Math.abs(sim / pred - 1) <= 0.25,
    show: (x) => num(x, 0),
    detail: (r) => `Kimura’s chance of taking over: ${(r.weakSubs.pfix / (1 / 1000)).toFixed(2)} × the neutral one (4N·h·s = 2)`,
    tolerance: '±25 % (about 3 standard deviations of chance)',
    why: 'When 4N·h·s is near 1, drift can carry a harmful mutation all the way: Kimura’s fixation probability gives about a third of the neutral rate here. This is how small populations collect damage.',
    source: 'Kimura 1962, Genetics 47:713; Ohta 1973, Nature 246:96',
  },
  {
    id: 'ratchet',
    title: 'Without sex the best genomes are lost for good',
    uses: ['clones', 'sexual'],
    predict: () => `the clones’ fewest broken copies climbs; with sex it stays near 0 (Haigh: ${num(haighN0(2000, 0.1, 0.25, sOf('strong')), 2)} genomes in the best class)`,
    measure: (r) =>
      `clones: fewest ${r.clones.min0} → ${r.clones.min1}, survival ${pct(r.clones.survival)}; sex: fewest ${r.sexual.min0} → ${r.sexual.min1}, survival ${pct(r.sexual.survival)}`,
    pass: (sim, pred, r) => r.clones.min1 - r.clones.min0 >= 20 && r.sexual.min1 <= 3,
    show: (x) => x,
    detail: () => 'generations 300 to 3,000',
    tolerance: 'clones gain at least 20, sex ends at 3 or fewer',
    why: 'Muller’s ratchet: in clones the least damaged genomes, only about N·e^−U/(h·s) of them, are lost by chance and cannot be rebuilt except by rare repairs. With sex, recombination keeps making clean genomes from damaged parents.',
    source: 'Muller 1964, Mutat. Res. 1:2; Felsenstein 1974, Genetics 78:737; Haigh 1978',
  },
  {
    id: 'synergy',
    title: 'Damage that hurts more and more lowers the price',
    uses: ['synergy'],
    predict: () => synergyBalance(1, -Math.log(1 - 0.25 * sOf('strong')), 2).survival,
    measure: (r) => r.synergy.survival,
    pass: (sim, pred) => Math.abs(sim - pred) <= 0.025,
    show: pct,
    tolerance: '±2.5 points',
    why: 'With synergy each death removes more broken copies than average, so fewer deaths are needed: Kimura & Maruyama’s balance for a Poisson number of mutations gives 46.9 %, above e^−U = 36.8 %.',
    source: 'Kimura & Maruyama 1966; Kondrashov 1988; Charlesworth 1990, Genet. Res. 55:199',
  },
  {
    id: 'males',
    title: 'Selection on males lowers the price to e^−{U/(1 + m/2)}',
    uses: ['males'],
    predict: () => maleSurvival(1, 2),
    measure: (r) => r.males.survival,
    pass: (sim, pred) => Math.abs(sim - pred) <= 0.025,
    show: pct,
    detail: (r) => `broken copies per genome ${num(r.males.copies, 1)}, predicted U/(h·s·(1 + m/2)) = ${num(copiesAtBalance(1, 0.25, sOf('strong')) / 2, 1)}`,
    tolerance: '±2.5 points',
    why: 'With m = 2 a male’s damage costs him twice as much in matings as in survival. A broken copy then leaves the population through its male carriers’ lost matings as well as through deaths, so balance needs only half as many broken copies and the young pay only half the deaths: e^−0.5 = 60.7 % survive instead of 36.8 %. The lost matings cost nothing, because other males father those young.',
    source: 'Agrawal 2001, Nature 411:692; Siller 2001, Nature 411:689; Whitlock & Agrawal 2009, Evolution 63:569',
  },
  {
    id: 'genome',
    title: 'The default genome after a million years: Wright’s forecast',
    uses: ['default'],
    heavy: true,
    predict: (r, ctx) => ctx.forecast.copies,
    measure: (r) => r.default.copies,
    pass: (sim, pred) => Math.abs(sim / pred - 1) <= 0.06,
    show: (x) => num(x, 0),
    detail: (r, ctx) => {
      const f = ctx.forecast;
      const parts = CLASSES.map((c, i) => `${c.label} ${num(r.default.byClass[i], 0)} (${num(f.byClass.get(i)?.copies ?? 0, 0)})`);
      return `broken copies per genome by effect, simulated (forecast): ${parts.join(', ')}`;
    },
    tolerance: '±6 %',
    why: 'Summing Wright’s distribution over all 5,120 genes forecasts the long-run genome: severe genes stay almost clean, while genes too weak for selection to see (4N·h·s below 1) end up mostly broken. After 40,000 generations the simulation is within a few percent of it.',
    source: 'Wright 1937; Kimura, Maruyama & Crow 1963, Genetics 48:1303',
  },
  {
    id: 'genomeSurvival',
    title: '… and the share of young that survive it',
    uses: ['default'],
    heavy: true,
    predict: (r, ctx) => ctx.forecast.survival,
    measure: (r) => r.default.survival,
    pass: (sim, pred) => Math.abs(sim - pred) <= 0.03,
    show: pct,
    tolerance: '±3 points',
    why: 'The load now has two parts: about U from genes under selection, plus the cost of weak genes that drift has broken in everyone. Forecast and simulation agree, and the population stays above the 20 % it needs.',
    source: 'Kimura, Maruyama & Crow 1963; Lynch, Conery & Bürger 1995, Am. Nat. 146:489',
  },
  {
    id: 'repeat',
    title: 'Same seed, same run',
    uses: ['repeat'],
    predict: () => 'identical, then different',
    measure: (r) => r.repeat.hashes.join(' · '),
    pass: (sim, pred, r) => r.repeat.hashes[0] === r.repeat.hashes[1] && r.repeat.hashes[0] !== r.repeat.hashes[2],
    show: (x) => x,
    detail: () => 'fingerprints of every genome after 500 generations',
    tolerance: 'exact',
    why: 'Every random draw comes from one seeded generator, so a run can be repeated exactly, here, in Node or in CI.',
    source: '',
  },
];

// Runs one experiment, reporting progress every so often and letting other
// work through.
async function runExperiment(x, onProgress) {
  const seeds = x.seeds ?? [`check-${x.id}`];
  const out = [];
  for (let k = 0; k < seeds.length; k++) {
    const e = new Engine({ seed: seeds[k], params: x.params });
    const t = x.track();
    let last = Date.now();
    while (e.gen < x.gens && !e.extinct) {
      e.step();
      t.each(e);
      if (Date.now() - last > 200) {
        last = Date.now();
        onProgress?.({ experiment: x.id, done: (k + e.gen / x.gens) / seeds.length });
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    out.push({ ...t.result(e), gen: e.gen, extinct: e.extinct });
  }
  if (x.seeds) return { hashes: out.map((o) => o.hash) };
  return out[0];
}

// Runs the checks (all, or those listed) and returns their results.
export async function runValidation(onProgress, only = null) {
  const t0 = Date.now();
  const checks = only ? CHECKS.filter((c) => only.includes(c.id)) : CHECKS;
  const needed = [...new Set(checks.flatMap((c) => c.uses))];
  const cost = (id) => EXP[id].gens * (EXP[id].seeds?.length ?? 1) * ((EXP[id].params.K ?? 2000) / 2000);
  const total = needed.reduce((a, id) => a + cost(id), 0);
  let doneCost = 0;
  const r = {};
  const seconds = {};
  for (const id of needed) {
    const s = Date.now();
    r[id] = await runExperiment(EXP[id], (p) => onProgress?.({ ...p, overall: (doneCost + p.done * cost(id)) / total }));
    seconds[id] = (Date.now() - s) / 1000;
    doneCost += cost(id);
    onProgress?.({ experiment: id, done: 1, overall: doneCost / total });
  }
  const ctx = {};
  if (needed.includes('default')) {
    ctx.forecast = genomeForecast({ N: 2000, U: 1, repair: 0.1, h: 0.25, effects: defaultEffects('check-default'), classOf });
  }
  const results = checks.map((c) => {
    const pred = c.predict(r, ctx);
    const sim = c.measure(r, ctx);
    const pass = !!c.pass(sim, pred, r);
    return {
      id: c.id,
      title: c.title,
      runs: c.uses.map((id) => EXP[id].label),
      predicted: typeof pred === 'number' ? c.show(pred) : pred,
      simulated: typeof sim === 'number' ? c.show(sim) : sim,
      detail: c.detail ? c.detail(r, ctx) : '',
      tolerance: c.tolerance,
      pass,
      why: c.why,
      source: c.source,
      seconds: c.uses.reduce((a, id) => a + (seconds[id] ?? 0), 0),
    };
  });
  return {
    passed: results.filter((x) => x.pass).length,
    total: results.length,
    seconds: (Date.now() - t0) / 1000,
    checks: results,
  };
}

// Rough seconds the checks take to run again, for the buttons (each run
// counted once when checks share it).
export function checkCost(ids) {
  const list = Array.isArray(ids) ? ids : [ids];
  const runs = new Set(CHECKS.filter((c) => list.includes(c.id)).flatMap((c) => c.uses));
  return [...runs].reduce((a, id) => a + EXP[id].secs, 0);
}
