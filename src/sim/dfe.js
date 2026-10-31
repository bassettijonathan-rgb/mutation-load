// The distribution of fitness effects (DFE): how much a broken gene costs.
//
// Genes come in families of 32 that share one effect s (the cost of having
// both copies of the gene broken; one broken copy costs h·s). The families'
// effects are evenly spaced quantiles of the chosen distribution, so even a
// few hundred families reproduce its shape faithfully, and are then shuffled
// along the chromosomes.

import { Rng } from './rng.js';

export const S_MAX = 0.99; // a broken gene costs at most 99 %

function lgamma(z) {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < 9; i++) x += c[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

// Regularised lower incomplete gamma P(a, x).
export function gammaP(a, x) {
  if (x <= 0) return 0;
  const lead = -x + a * Math.log(x) - lgamma(a);
  if (x < a + 1) {
    let term = 1 / a;
    let sum = term;
    for (let n = 1; n < 1000; n++) {
      term *= x / (a + n);
      sum += term;
      if (term < sum * 1e-16) break;
    }
    return Math.min(1, sum * Math.exp(lead));
  }
  let b = x + 1 - a;
  let c = 1e300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.max(0, 1 - Math.exp(lead) * h);
}

// Fraction of new damaging mutations with effect below s, for a gamma DFE.
export function gammaCdf(s, shape, mean) {
  return gammaP(shape, s / (mean / shape));
}

// Quantile of the gamma distribution, by bisection on log s (robust for the
// very small shapes estimated for real mutations).
export function gammaQuantile(p, shape, mean) {
  let lo = -60;
  let hi = Math.log(mean / shape) + 8;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (gammaCdf(Math.exp(mid), shape, mean) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-10) break;
  }
  return Math.exp(0.5 * (lo + hi));
}

// Ready-made DFEs. 'gamma' follows estimates for new amino-acid-changing
// mutations in humans (shape about 0.2, mean effect about 1 %).
export const DFE_PRESETS = {
  human: { kind: 'gamma', shape: 0.2, mean: 0.01 },
  strong: { kind: 'fixed', s: 0.05 },
  mild: { kind: 'fixed', s: 0.005 },
  weak: { kind: 'fixed', s: 0.0005 },
  tiny: { kind: 'fixed', s: 0.00002 },
};

// One effect per family: stratified quantiles, shuffled with the seed.
export function familyEffects(nFam, dfe, seed) {
  const s = new Float64Array(nFam);
  if (dfe.kind === 'fixed') {
    s.fill(Math.min(S_MAX, dfe.s));
  } else if (dfe.kind === 'list') {
    for (let i = 0; i < nFam; i++) s[i] = Math.min(S_MAX, dfe.values[i % dfe.values.length]);
  } else {
    for (let i = 0; i < nFam; i++) s[i] = Math.min(S_MAX, gammaQuantile((i + 0.5) / nFam, dfe.shape, dfe.mean));
  }
  if (dfe.kind !== 'list' || dfe.shuffle) {
    const rng = new Rng(`dfe:${seed}`);
    for (let i = nFam - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      const t = s[i];
      s[i] = s[j];
      s[j] = t;
    }
  }
  return s;
}
