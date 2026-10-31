// What population genetics predicts, to set beside the simulation.
//
//   loadSurvival(U)         Haldane (1937) and Muller (1950): at balance a
//                           share e^-U of the young survive, whatever s is.
//   copiesAtBalance(U,h,s)  broken copies per genome at balance: U / (h·s).
//   wright(...)             Wright's (1931, 1937) stationary distribution of
//                           one gene's broken share under mutation, repair,
//                           selection and drift.
//   pfix(N, s, h)           Kimura's (1962) chance that one new broken copy
//                           ends up in every genome.
//   genomeForecast(...)     Wright's distribution summed over every gene of
//                           a genome: the long-run state of the whole thing.
//   persists(F, U)          whether the young outnumber the deaths.
//   haighN0(N, U, h, s)     Haigh (1978): genomes in the least-damaged class
//                           of an asexual population, which the ratchet
//                           loses one class at a time.
//   synergyBalance(...)     the balance when damage hurts more and more
//                           (Kimura & Maruyama 1966, Charlesworth 1990).
//   maleSurvival(U, m)      the price when healthier males also father more
//                           young: e^(-U / (1 + m/2)) (after Agrawal 2001,
//                           Whitlock & Agrawal 2009).

export function loadSurvival(U) {
  return Math.exp(-U);
}

export function copiesAtBalance(U, h, s) {
  return U / (h * s);
}

// Selection on males of strength m: a male's matings are multiplied by
// w^m, w being his survival fitness. A broken copy that costs h·s of
// survival then also costs its male carriers about m·h·s of their matings,
// and since half of every young's genes come from its father, it leaves the
// population at h·s·(1 + m/2) per generation instead of h·s. Balance needs
// only 1 / (1 + m/2) as many broken copies, so the young pay only that share
// of the deaths: the rest of the removal happens through males' lost
// matings, which other males take up, so no young go unborn.
export function maleSurvival(U, m) {
  return Math.exp(-U / (1 + m / 2));
}

export function maleCopies(U, h, s, m) {
  return U / (h * s * (1 + m / 2));
}

// The share of the young that must survive for the population to replace
// itself: each female has F young on average, half of them daughters.
export function survivalNeeded(F) {
  return 2 / F;
}

export function persists(F, U) {
  return (F / 2) * Math.exp(-U) >= 1;
}

export function haighN0(N, U, h, s) {
  return N * Math.exp(-U / (h * s));
}

// Kimura's diffusion result for a new mutation at frequency p = 1 / (2N) in
// a population of N diploids, with fitnesses 1, 1 - h·s, 1 - s. Integrated
// numerically so any dominance works.
export function pfix(N, s, h, p = 1 / (2 * N)) {
  if (Math.abs(s) < 1e-12) return p;
  // G(x) = exp(4Ns (h x + (1 - 2h) x² / 2)), the deleterious allele's
  // "speed" term; Pfix = ∫0^p G / ∫0^1 G. Logs keep big N·s finite.
  const lg = (x) => 4 * N * s * (h * x + ((1 - 2 * h) * x * x) / 2);
  let top = -Infinity;
  for (let i = 0; i <= 64; i++) top = Math.max(top, lg(i / 64));
  const integral = (a, b, n) => {
    const dx = (b - a) / n;
    let sum = 0;
    for (let i = 0; i <= n; i++) {
      const w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
      sum += w * Math.exp(lg(a + i * dx) - top);
    }
    return (sum * dx) / 3;
  };
  const whole = integral(0, 1, 20000);
  return integral(0, p, 200) / whole;
}

// One gene under mutation (intact → broken at rate u per copy), repair
// (broken → intact at rate v), selection (fitnesses 1, 1 - h·s, 1 - s) and
// drift in N diploids. Wright's stationary density of the broken share q:
//   φ(q) ∝ q^(4Nu-1) (1-q)^(4Nv-1) w̄(q)^(2N),  w̄ = 1 - 2hs·q(1-q) - s·q².
// Returns the long-run averages: broken share, heterozygosity, mean log
// fitness and the chance the gene is broken in every copy (q within 1/(2N)
// of 1) or intact in every copy.
export function wright(N, u, v, s, h) {
  const a = 4 * N * u;
  const b = 4 * N * v;
  const logw = (q, r) => Math.log(Math.max(1e-300, 1 - 2 * h * s * q * r - s * q * q));
  // Each half of [0, 1] in a log variable around its own end, where the
  // density can blow up; the last stretch next to the end is done by hand.
  const EDGE = 1e-14;
  const n = 1200;
  const parts = []; // [log weight, q, r] samples with Simpson weights
  for (const side of [0, 1]) {
    const lo = Math.log(EDGE);
    const hi = Math.log(0.5);
    const dx = (hi - lo) / n;
    for (let i = 0; i <= n; i++) {
      const z = Math.exp(lo + i * dx); // distance from the end
      const q = side === 0 ? z : 1 - z;
      const r = side === 0 ? 1 - z : z;
      // q^(a-1) r^(b-1) w̄^2N dq, with dq = z dx
      const lw = (a - 1) * Math.log(q) + (b - 1) * Math.log(r) + 2 * N * logw(q, r) + Math.log(z) + Math.log(dx / 3);
      const simpson = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
      parts.push([lw + Math.log(simpson), q, r]);
    }
    // from the end to EDGE: the density there is a pure power of z
    const q0 = side === 0 ? 0 : 1;
    const r0 = 1 - q0;
    const pw = side === 0 ? a : b;
    const lw0 = Math.log(Math.pow(EDGE, pw) / pw) + 2 * N * logw(q0, r0);
    parts.push([lw0, q0, r0, true]);
  }
  let top = -Infinity;
  for (const p of parts) top = Math.max(top, p[0]);
  let Z = 0;
  let Eq = 0;
  let Eq2 = 0;
  let Ehet = 0;
  let Elogw = 0;
  let Ew = 0;
  let fixedBroken = 0;
  let fixedIntact = 0;
  const near = 1 / (2 * N);
  for (const [lw, q, r] of parts) {
    const w = Math.exp(lw - top);
    Z += w;
    Eq += w * q;
    Eq2 += w * q * q;
    Ehet += w * 2 * q * r;
    const lf = logw(q, r);
    Elogw += w * lf;
    Ew += w * Math.exp(lf);
    if (r < near) fixedBroken += w;
    if (q < near) fixedIntact += w;
  }
  return {
    q: Eq / Z,
    q2: Eq2 / Z,
    het: Ehet / Z,
    logw: Elogw / Z,
    w: Ew / Z,
    fixedBroken: fixedBroken / Z,
    fixedIntact: fixedIntact / Z,
  };
}

// The long-run forecast for a whole genome: Wright's distribution for every
// family of genes, summed. Genes are treated as independent.
export function genomeForecast({ N, U, repair, h, effects, genesPerFamily = 32, classOf }) {
  const L = effects.length * genesPerFamily;
  const u = U / (2 * L);
  const v = u * repair;
  const byClass = new Map();
  let copies = 0;
  let logSurvival = 0;
  let fixedBroken = 0;
  const cache = new Map();
  for (const s of effects) {
    let g = cache.get(s);
    if (!g) {
      g = wright(N, u, v, s, h);
      cache.set(s, g);
    }
    copies += 2 * g.q * genesPerFamily;
    logSurvival += g.logw * genesPerFamily;
    fixedBroken += g.fixedBroken * genesPerFamily;
    if (classOf) {
      const k = classOf(s);
      const c = byClass.get(k) ?? { genes: 0, copies: 0, fixedBroken: 0, logSurvival: 0 };
      c.genes += genesPerFamily;
      c.copies += 2 * g.q * genesPerFamily;
      c.fixedBroken += g.fixedBroken * genesPerFamily;
      c.logSurvival += g.logw * genesPerFamily;
      byClass.set(k, c);
    }
  }
  return { copies, survival: Math.exp(logSurvival), fixedBroken, byClass };
}

// Damage that hurts more and more: log fitness = -D - ε·D²/2, with D = d·n
// for n broken copies of cost d each (all in one copy, as at balance). With
// free recombination the number of broken copies in the young is close to
// Poisson; selection takes the mean from m down to m', mutation adds U back,
// so at balance m - m' = U. Returns the balance mean and the survival.
export function synergyBalance(U, d, eps) {
  const surv = (m) => {
    // Poisson(m) averages of w(n) and n·w(n)
    let p = Math.exp(-m);
    let W = 0;
    let NW = 0;
    const top = Math.ceil(m + 12 * Math.sqrt(m + 1) + 20);
    for (let n = 0; n <= top; n++) {
      if (n > 0) p *= m / n;
      const D = d * n;
      const w = Math.exp(-D - 0.5 * eps * D * D);
      W += p * w;
      NW += p * n * w;
    }
    return { W, after: NW / W };
  };
  let lo = U;
  let hi = U / d + U + 10;
  for (let i = 0; i < 200; i++) {
    const m = 0.5 * (lo + hi);
    if (m - surv(m).after < U) lo = m;
    else hi = m;
  }
  const m = 0.5 * (lo + hi);
  return { mean: m, survival: surv(m).W };
}
