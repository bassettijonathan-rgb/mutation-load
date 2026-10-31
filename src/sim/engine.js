// The population: K places for adults, each adult a diploid genome of L
// genes on C chromosomes. A gene copy is either intact (bit 0) or broken
// (bit 1); 32 neighbouring genes form a family that shares one effect s.
//
// One generation:
//   1. Mating. Each female conceives a Poisson number of young (mean F);
//      each young has a father drawn at random among the males (or, with
//      selection on males on, more often a healthier one).
//   2. Meiosis. Each parent passes one recombinant copy of every
//      chromosome; new mutations break intact genes (and, more rarely,
//      repair broken ones).
//   3. Survival. A young survives to adulthood with probability w, set by
//      its broken genes: (1 - h·s) for each gene broken in one copy,
//      (1 - s) for each broken in both. A random draw decides.
//   4. Places. If more young survive than there are places, the places go
//      at random (or, with competition on, more often to the healthier).
// Nobody picks the parents: selection is only that damaged young die a
// little more often.

import { Rng } from './rng.js';
import { familyEffects, DFE_PRESETS } from './dfe.js';
import { DEFAULTS, normalize } from './params.js';
import { KERNEL_WASM } from './kernel-wasm.js';

// The breeding loop also exists as WebAssembly (src/wasm/kernel.c), faster
// and giving exactly the same results. Where WebAssembly is not allowed, the
// JavaScript version runs instead.
let kernelModule; // undefined: not tried yet; null: not available
function wasmModule() {
  if (kernelModule === undefined) {
    try {
      const bin =
        typeof atob === 'function'
          ? Uint8Array.from(atob(KERNEL_WASM), (c) => c.charCodeAt(0))
          : Uint8Array.from(globalThis.Buffer.from(KERNEL_WASM, 'base64'));
      kernelModule = new WebAssembly.Module(bin);
    } catch {
      kernelModule = null;
    }
  }
  return kernelModule;
}

export function popcnt(x) {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

// bits a .. b-1 set (0 <= a <= b <= 32)
function bitsRange(a, b) {
  const hi = b >= 32 ? -1 : ((1 << b) - 1) | 0;
  const lo = ((1 << a) - 1) | 0;
  return hi & ~lo;
}

// Effect classes used by the charts, by the cost s of a gene broken in both
// copies.
export const CLASSES = [
  { key: 'severe', label: 'severe', min: 0.01 },
  { key: 'mild', label: 'mild', min: 0.001 },
  { key: 'slight', label: 'slight', min: 0.0001 },
  { key: 'tiny', label: 'tiny', min: -Infinity },
];

export function classOf(s) {
  for (let i = 0; i < CLASSES.length; i++) if (s >= CLASSES[i].min) return i;
  return CLASSES.length - 1;
}

export function dfeOf(p) {
  if (p.dfe === 'custom') return { kind: 'gamma', shape: p.shape, mean: p.meanS };
  if (p.dfe === 'customFixed') return { kind: 'fixed', s: p.fixedS };
  if (p.dfe && typeof p.dfe === 'object') return p.dfe;
  return DFE_PRESETS[p.dfe] ?? DFE_PRESETS.human;
}

// Meiosis uses crossover patterns drawn fresh every generation: for each
// chromosome a pool of POOL patterns, each with a random starting copy and a
// Poisson number of crossovers at random places between genes, stored as a
// mask (which parental copy each gene comes from). Every gamete picks one
// pattern per chromosome at random. The pools are kept small so they stay in
// the processor's cache.
export const POOL = 256;

// The heart of a generation: make and judge young until the places are full
// or the conceptions run out. Results go to e.out: [tried, survived, new
// damage, repairs]. Survivors are also folded into the masks of genes
// broken in any copy and in every copy.
function breed(e, conceived, nF, nM, asex) {
  const p = e.params;
  const W = e.W;
  const C = e.C;
  const WPC = e.WPC;
  const L = e.L;
  const rng = e.rng;
  const c1 = e.c1;
  const c2 = e.c2;
  const fem = e.fem;
  const mal = e.mal;
  const thr = e.thr;
  const alias = e.alias;
  const maleSel = p.males > 0 && !asex;
  const geno = e.geno;
  const next = e.next;
  const pool = e.pool;
  const orM = e.orMask;
  const andM = e.andMask;
  const eps = p.epistasis;
  const hitsD = e.hitsDamage;
  const eHitsD = Math.exp(-hitsD);
  const hitsR = e.hitsRepair;
  const eHitsR = Math.exp(-hitsR);
  const monotone = e.monotone;
  const cap = e.capNext;
  const nextDmg = e.nextDmg;
  const nextCnt = e.nextCnt;
  const nextSex = e.nextSex;
  const W2 = 2 * W;
  const PW = POOL * WPC;
  const mg = e.mutGene; // [maternal 0..63 | paternal 64..127]
  const mk = e.mutKind;
  const pick = e.pick; // pattern per chromosome: [maternal C | paternal C]
  let made = 0;
  let repaired = 0;
  let tried = 0;
  let survived = 0;

  while (tried < conceived && survived < cap) {
    tried++;
    // the luck this young will need: it survives if its damage stays below
    // E (an exponential draw), which happens with probability exp(-damage)
    const E = -Math.log(1 - rng.float());
    const limit = eps > 0 ? (Math.sqrt(1 + 2 * eps * E) - 1) / eps : E;
    const ma = fem[rng.int(nF)] * W2;
    let pa = ma;
    if (!asex) {
      // the father: one male at random, or (selection on males) the alias
      // draw that makes healthier males likelier
      let k = rng.int(nM);
      if (maleSel && rng.u32() >= thr[k]) k = alias[k];
      pa = mal[k] * W2;
    }
    if (!asex) {
      for (let i = 0; i < 2 * C; i += 4) {
        const r = rng.u32();
        pick[i] = r & 255;
        pick[i + 1] = (r >>> 8) & 255;
        pick[i + 2] = (r >>> 16) & 255;
        pick[i + 3] = r >>> 24;
      }
    }

    // new mutations in each gamete, sorted along the genome
    let nmM = 0;
    let nmP = 0;
    for (let side = 0; side < 2; side++) {
      const base = side << 6;
      let n = 0;
      for (let kind = 1; kind >= 0; kind--) {
        const mean = kind ? hitsD : hitsR;
        if (mean <= 0) continue;
        let pk = kind ? eHitsD : eHitsR;
        let cum = pk;
        const u = rng.float();
        let k = 0;
        while (u > cum && k < 60) {
          k++;
          pk *= mean / k;
          cum += pk;
        }
        for (let i = 0; i < k && n < 64; i++) {
          const g = rng.int(L);
          let j = n;
          while (j > 0 && mg[base + j - 1] > g) {
            mg[base + j] = mg[base + j - 1];
            mk[base + j] = mk[base + j - 1];
            j--;
          }
          mg[base + j] = g;
          mk[base + j] = kind;
          n++;
        }
      }
      if (side === 0) nmM = n;
      else nmP = n;
    }

    // build the young chromosome by chromosome, adding up its damage
    const d0 = survived * W2;
    const d1 = d0 + W;
    let D = 0;
    let cnt = 0;
    let iM = 0;
    let iP = 64;
    const endP = 64 + nmP;
    let dead = false;
    for (let c = 0; c < C; c++) {
      const w0 = c * WPC;
      const w1 = w0 + WPC;
      if (asex) {
        for (let w = w0; w < w1; w++) {
          next[d0 + w] = geno[ma + w];
          next[d1 + w] = geno[ma + W + w];
        }
      } else {
        const om = c * PW + pick[c] * WPC - w0;
        const op = c * PW + pick[C + c] * WPC - w0;
        const mb = ma + W;
        const pb = pa + W;
        for (let w = w0; w < w1; w++) {
          const m = pool[om + w];
          const q = pool[op + w];
          next[d0 + w] = (geno[ma + w] & ~m) | (geno[mb + w] & m);
          next[d1 + w] = (geno[pa + w] & ~q) | (geno[pb + w] & q);
        }
      }
      while (iM < nmM && mg[iM] >>> 5 < w1) {
        const g = mg[iM];
        const i = d0 + (g >>> 5);
        const bit = 1 << (g & 31);
        const x = next[i];
        if (mk[iM]) {
          if ((x & bit) === 0) {
            next[i] = x | bit;
            made++;
          }
        } else if ((x & bit) !== 0) {
          next[i] = x ^ bit;
          repaired++;
        }
        iM++;
      }
      while (iP < endP && mg[iP] >>> 5 < w1) {
        const g = mg[iP];
        const i = d1 + (g >>> 5);
        const bit = 1 << (g & 31);
        const x = next[i];
        if (mk[iP]) {
          if ((x & bit) === 0) {
            next[i] = x | bit;
            made++;
          }
        } else if ((x & bit) !== 0) {
          next[i] = x ^ bit;
          repaired++;
        }
        iP++;
      }
      for (let w = w0; w < w1; w++) {
        const x = next[d0 + w];
        const y = next[d1 + w];
        const het = x ^ y;
        const hom = x & y;
        if ((het | hom) !== 0) {
          const a = popcnt(het);
          const b = popcnt(hom);
          D -= a * c1[w] + b * c2[w];
          cnt += a + 2 * b;
        }
      }
      // damage only grows along the genome, so a young already past its
      // luck is dead: stop building it
      if (monotone && D > limit) {
        dead = true;
        break;
      }
    }
    if (dead || D > limit) continue;

    // a survivor: fold it into the masks
    for (let w = 0; w < W; w++) {
      const x = next[d0 + w];
      const y = next[d1 + w];
      orM[w] |= x | y;
      andM[w] &= x & y;
    }
    nextDmg[survived] = D;
    nextCnt[survived] = cnt;
    nextSex[survived] = asex ? 0 : rng.u32() & 1;
    survived++;
  }
  const out = e.out;
  out[0] = tried;
  out[1] = survived;
  out[2] = made;
  out[3] = repaired;
}

// Fresh crossover patterns (see POOL): a quarter of each pool is redrawn
// every generation (all of it at the start), so a pattern serves at most four
// generations.
function drawPatterns(e, all) {
  const { C, WPC, rng, pool } = e;
  const xs = e.xs;
  const lam = e.params.mode === 'sex' ? e.params.crossovers : 0;
  const eLam = Math.exp(-lam);
  const G = WPC * 32;
  const per = all ? POOL : POOL / 4;
  const first = all ? 0 : (e.gen & 3) * per;
  for (let c = 0; c < C; c++) {
    for (let k = first; k < first + per; k++) {
      const start = rng.u32() & 1;
      let n = 0;
      if (lam > 0) {
        let pk = eLam;
        let cum = pk;
        const u = rng.float();
        while (u > cum && n < 30) {
          n++;
          pk *= lam / n;
          cum += pk;
        }
        for (let i = 0; i < n; i++) {
          const x = 1 + rng.int(G - 1);
          let j = i;
          while (j > 0 && xs[j - 1] > x) {
            xs[j] = xs[j - 1];
            j--;
          }
          xs[j] = x;
        }
      }
      // the pattern as a mask, word by word
      let cur = start ? -1 : 0;
      let j = 0;
      const o = (c * POOL + k) * WPC;
      for (let w = 0; w < WPC; w++) {
        const lo = w << 5;
        const hi = lo + 32;
        if (j < n && xs[j] < hi) {
          let m = 0;
          let pos = lo;
          while (j < n && xs[j] < hi) {
            const at = xs[j];
            if (cur) m |= bitsRange(pos - lo, at - lo);
            cur = ~cur;
            pos = at;
            j++;
          }
          if (cur) m |= bitsRange(pos - lo, 32);
          pool[o + w] = m;
        } else pool[o + w] = cur;
      }
    }
  }
}

const MAX_HISTORY = 2400;

export class Engine {
  constructor({ seed = 'genome', params = {}, effects = null, useWasm = true } = {}) {
    this.seed = String(seed);
    const p = normalize(params);
    this.params = p;
    this.rng = new Rng(this.seed);
    const L = p.genes;
    const C = p.chromosomes;
    const W = L / 32;
    this.L = L;
    this.C = C;
    this.W = W;
    this.WPC = W / C;
    this.K = p.K;

    // Memory. Adult i owns words [2iW, 2iW + 2W) of a genome buffer; the
    // young are written into a second buffer and the two swap every
    // generation. With competition on, up to 2K young survive to compete for
    // K places, so every buffer has room for 2K (competition can be switched
    // on during a run). Everything lives in one block, which is the
    // WebAssembly memory when that kernel runs.
    const cap = 2 * p.K;
    const sexual = p.mode !== 'asex';
    const parts = [
      ['genoA', Int32Array, 2 * cap * W],
      ['genoB', Int32Array, 2 * cap * W],
      ['pool', Int32Array, C * POOL * this.WPC],
      ['c1', Float64Array, W], // log(1 - h·s): one broken copy
      ['c2', Float64Array, W], // log(1 - s): both copies broken
      ['fem', Int32Array, p.K],
      ['mal', Int32Array, p.K],
      ['thr', Uint32Array, p.K], // fathers' alias table: keep threshold
      ['alias', Int32Array, p.K], // ... and the alternative
      ['dmgA', Float64Array, cap], // D: damage in log-fitness units
      ['dmgB', Float64Array, cap],
      ['cntA', Int32Array, cap], // broken gene copies
      ['cntB', Int32Array, cap],
      ['sexA', Uint8Array, cap],
      ['sexB', Uint8Array, cap],
      ['orMask', Int32Array, W], // genes broken in any copy of the adults
      ['andMask', Int32Array, W], // ... and in every copy
      ['mutGene', Int32Array, 128],
      ['mutKind', Uint8Array, 128],
      ['pick', Int32Array, 2 * C + 4],
      ['out', Float64Array, 4],
      ['rngState', Uint32Array, 4],
    ];
    let bytes = 0;
    const at = {};
    for (const [name, T, n] of parts) {
      at[name] = bytes;
      bytes += Math.ceil((n * T.BYTES_PER_ELEMENT) / 16) * 16;
    }
    let base = 0;
    let buffer = null;
    this.wasm = null;
    const mod = useWasm ? wasmModule() : null;
    if (mod) {
      try {
        const memory = new WebAssembly.Memory({ initial: 2 });
        const inst = new WebAssembly.Instance(mod, { env: { memory, log: Math.log } });
        base = Math.ceil(inst.exports.__heap_base.value / 16) * 16;
        const have = memory.buffer.byteLength / 65536;
        const pages = Math.ceil((base + bytes) / 65536);
        if (pages > have) memory.grow(pages - have);
        buffer = memory.buffer;
        this.wasm = inst.exports;
      } catch {
        this.wasm = null;
        base = 0;
      }
    }
    if (!buffer) buffer = new ArrayBuffer(bytes);
    const view = {};
    for (const [name, T, n] of parts) {
      at[name] += base;
      view[name] = new T(buffer, at[name], n);
    }
    this.at = at;
    this.view = view;
    this.kernel = this.wasm ? 'wasm' : 'js';
    this.half = 0; // which buffers hold the adults: A (0) or B (1)
    this.bindHalves();
    for (const k of ['pool', 'c1', 'c2', 'fem', 'mal', 'thr', 'alias', 'orMask', 'andMask', 'mutGene', 'mutKind', 'pick', 'out']) this[k] = view[k];
    this.key = new Float64Array(cap);
    this.fatherW = new Float64Array(p.K);
    this.fatherStack = new Int32Array(2 * p.K);
    this.capNext = p.competition > 0 ? cap : p.K;
    this.poolReady = false;
    this.changes = []; // settings changed during the run: {gen, patch}
    this.xs = new Int32Array(32);
    this.made = 0;
    this.repaired = 0;

    // effects per family
    this.sFam = effects ? Float64Array.from(effects) : familyEffects(W, dfeOf(p), this.seed);
    this.cls = new Uint8Array(W);
    // mutation per gamete: Poisson numbers of hits on random genes
    this.uGene = p.U / (2 * L); // per gene copy per generation
    this.hitsDamage = p.U / 2;
    this.hitsRepair = (p.U / 2) * p.repair;
    this.setDominance(p.h);

    // start: every place filled, every gene intact, sexes alternating
    this.N = p.K;
    for (let i = 0; i < p.K; i++) this.sex[i] = sexual ? i & 1 : 0;

    // bookkeeping
    this.gen = 0;
    this.extinct = false;
    this.fixedMask = new Int32Array(W); // last fixed state of each gene (1 = broken)
    this.subs = { damage: 0, repair: 0, damageBy: new Float64Array(CLASSES.length), repairBy: new Float64Array(CLASSES.length) };
    this.classGenes = new Int32Array(CLASSES.length); // genes per effect class
    for (let w = 0; w < W; w++) this.classGenes[this.cls[w]] += 32;
    this.last = null; // statistics of the latest generation
    this.history = [];
    this.stride = 1;
    this.totalMade = 0;
    this.totalRepaired = 0;
    this.recountMasks();
    this.stats(null);
    this.record(true);
  }

  bindHalves() {
    const v = this.view;
    const a = this.half === 0;
    this.geno = a ? v.genoA : v.genoB;
    this.next = a ? v.genoB : v.genoA;
    this.dmg = a ? v.dmgA : v.dmgB;
    this.nextDmg = a ? v.dmgB : v.dmgA;
    this.cnt = a ? v.cntA : v.cntB;
    this.nextCnt = a ? v.cntB : v.cntA;
    this.sex = a ? v.sexA : v.sexB;
    this.nextSex = a ? v.sexB : v.sexA;
  }

  setDominance(h) {
    const { sFam, cls, c1, c2, W } = this;
    this.h = h;
    let monotone = true;
    for (let w = 0; w < W; w++) {
      const s = sFam[w];
      cls[w] = classOf(s);
      c1[w] = Math.log(1 - h * s);
      c2[w] = Math.log(1 - s);
      if (c1[w] > 0 || c2[w] > 0) monotone = false;
    }
    // with no beneficial genes, damage can only grow as a genome is read
    this.monotone = monotone;
    this.setupKernel();
  }

  setupKernel() {
    if (!this.wasm) return;
    const p = this.params;
    const at = this.at;
    this.wasm.setup(
      this.W,
      this.C,
      this.WPC,
      this.L,
      POOL,
      this.capNext,
      this.monotone ? 1 : 0,
      p.epistasis,
      this.hitsDamage,
      Math.exp(-this.hitsDamage),
      this.hitsRepair,
      Math.exp(-this.hitsRepair),
      at.pool,
      at.fem,
      at.mal,
      at.mutGene,
      at.mutKind,
      at.pick,
      at.c1,
      at.c2,
      at.orMask,
      at.andMask,
      at.out,
      at.rngState,
      at.thr,
      at.alias,
    );
  }

  // One generation. The young are made and judged one at a time, in random
  // order, until the places are full or the conceptions run out. That is the
  // same as judging every conception and then filling the places at random
  // among the survivors, but it skips work that could not change the result.
  step() {
    if (this.extinct) return;
    const p = this.params;
    const { rng, fem, mal } = this;
    const N = this.N;
    const asex = p.mode === 'asex';

    // who can be a mother, who a father
    let nF = 0;
    let nM = 0;
    const sex = this.sex;
    for (let i = 0; i < N; i++) {
      if (asex || sex[i] === 0) fem[nF++] = i;
      else mal[nM++] = i;
    }
    if (nF === 0 || (!asex && nM === 0)) {
      this.extinct = true;
      this.N = 0;
      this.gen++;
      this.stats({ conceived: 0, tried: 0, survived: 0 });
      this.record(true);
      return;
    }

    if (!asex && p.males > 0) this.buildFathers(nM);

    // conceptions: Poisson per female; an asexual mother has half as many,
    // so both kinds of population have the same births per adult
    const conceived = rng.poisson((asex ? 0.5 : 1) * p.F * nF);
    if (!asex) {
      drawPatterns(this, !this.poolReady);
      this.poolReady = true;
    }
    this.orMask.fill(0);
    this.andMask.fill(-1);
    if (this.wasm) {
      const r = this.rng;
      const st = this.view.rngState;
      st[0] = r.a;
      st[1] = r.b;
      st[2] = r.c;
      st[3] = r.d;
      const a = this.half === 0;
      const at = this.at;
      this.wasm.breed(
        a ? at.genoA : at.genoB,
        a ? at.genoB : at.genoA,
        a ? at.dmgB : at.dmgA,
        a ? at.cntB : at.cntA,
        a ? at.sexB : at.sexA,
        conceived,
        nF,
        nM,
        asex ? 1 : 0,
        !asex && p.males > 0 ? 1 : 0,
      );
      r.a = st[0] | 0;
      r.b = st[1] | 0;
      r.c = st[2] | 0;
      r.d = st[3] | 0;
    } else breed(this, conceived, nF, nM, asex);
    const out = this.out;
    const tried = out[0];
    const survived = out[1];
    const made = out[2];
    const repaired = out[3];

    const kept = Math.min(survived, p.K);
    if (survived > p.K) this.compete(survived);

    // the young become the adults
    this.half ^= 1;
    this.bindHalves();
    this.N = kept;
    this.gen++;
    this.made = made;
    this.repaired = repaired;
    this.totalMade += made;
    this.totalRepaired += repaired;
    if (survived > p.K) this.recountMasks();
    if (kept === 0) this.extinct = true;
    this.stats({ conceived, tried, survived });
    this.record(false);
  }

  // Selection on males: a young's father is drawn with probability in
  // proportion to w^males, where w is the male's own chance of having
  // survived his genes. With males = 1, a male whose damage cut his survival
  // by 10 % also wins 10 % fewer matings; with 2, about 20 % fewer. The draw
  // uses Walker's alias method: a male at random, then a second draw keeps
  // him (below his threshold) or takes his alias instead.
  buildFathers(nM) {
    const p = this.params;
    const { mal, dmg, thr, alias } = this;
    const wt = this.fatherW;
    const beta = p.males;
    const eps = p.epistasis;
    let top = -Infinity;
    for (let k = 0; k < nM; k++) {
      const D = dmg[mal[k]];
      const logw = eps > 0 && D > 0 ? -D - 0.5 * eps * D * D : -D;
      wt[k] = logw;
      if (logw > top) top = logw;
    }
    let sum = 0;
    for (let k = 0; k < nM; k++) {
      wt[k] = Math.exp(beta * (wt[k] - top));
      sum += wt[k];
    }
    const st = this.fatherStack; // small ones from the bottom, large from the top
    let ns = 0;
    let nl = 0;
    const top0 = st.length - 1;
    for (let k = 0; k < nM; k++) {
      wt[k] = (wt[k] * nM) / sum;
      alias[k] = k;
      thr[k] = 4294967295;
      if (wt[k] < 1) st[ns++] = k;
      else st[top0 - nl++] = k;
    }
    while (ns > 0 && nl > 0) {
      const s = st[--ns];
      const l = st[top0 - --nl];
      thr[s] = Math.min(4294967295, Math.floor(wt[s] * 4294967296));
      alias[s] = l;
      wt[l] = wt[l] + wt[s] - 1;
      if (wt[l] < 1) st[ns++] = l;
      else st[top0 - nl++] = l;
    }
  }

  // Competition for places among more survivors than places: each draws a
  // lottery key weighted by fitness^competition (weighted sampling without
  // replacement); the K best keys win and move to the front.
  compete(survived) {
    const p = this.params;
    const { key, rng, nextDmg, nextCnt, nextSex, next, W } = this;
    const beta = p.competition;
    const eps = p.epistasis;
    for (let i = 0; i < survived; i++) {
      const D = nextDmg[i];
      const logw = eps > 0 && D > 0 ? -D - 0.5 * eps * D * D : -D;
      // Efraimidis–Spirakis: key = log(u) / weight; the largest keys win
      key[i] = Math.log(1 - rng.float()) / Math.exp(beta * logw);
    }
    const ord = Array.from({ length: survived }, (_, i) => i).sort((x, y) => key[y] - key[x] || x - y);
    const win = ord.slice(0, p.K).sort((x, y) => x - y);
    const W2 = 2 * W;
    for (let j = 0; j < win.length; j++) {
      const i = win[j];
      if (i === j) continue;
      next.copyWithin(j * W2, i * W2, i * W2 + W2);
      nextDmg[j] = nextDmg[i];
      nextCnt[j] = nextCnt[i];
      nextSex[j] = nextSex[i];
    }
  }

  // Which genes are broken in any copy, and in every copy, of the adults
  // (normally gathered while breeding; recounted after competition).
  recountMasks() {
    const { N, W, geno, orMask, andMask } = this;
    orMask.fill(0);
    andMask.fill(N > 0 ? -1 : 0);
    const H = 2 * N;
    for (let k = 0; k < H; k++) {
      const o = k * W;
      for (let w = 0; w < W; w++) {
        const x = geno[o + w];
        orMask[w] |= x;
        andMask[w] &= x;
      }
    }
  }

  // Population summary of the adults now alive, plus the substitutions
  // (genes that became broken, or repaired, in every copy).
  stats(births) {
    const { N, W, dmg, cnt, cls } = this;
    let sumD = 0;
    let sumD2 = 0;
    let sumN = 0;
    let sumN2 = 0;
    let minN = Infinity;
    let atMin = 0;
    for (let i = 0; i < N; i++) {
      const D = dmg[i];
      const n = cnt[i];
      sumD += D;
      sumD2 += D * D;
      sumN += n;
      sumN2 += n * n;
      if (n < minN) {
        minN = n;
        atMin = 1;
      } else if (n === minN) atMin++;
    }
    const orM = this.orMask;
    const andM = this.andMask;
    let brokenAll = 0;
    let poly = 0;
    const fixedBy = [0, 0, 0, 0];
    const fx = this.fixedMask;
    const subs = this.subs;
    if (N > 0) {
      for (let w = 0; w < W; w++) {
        const a = andM[w];
        const o = orM[w];
        const na = popcnt(a);
        brokenAll += na;
        fixedBy[cls[w]] += na;
        poly += popcnt(o & ~a);
        const newD = a & ~fx[w];
        const newR = ~o & fx[w];
        if ((newD | newR) !== 0) {
          const nd = popcnt(newD);
          const nr = popcnt(newR);
          subs.damage += nd;
          subs.repair += nr;
          subs.damageBy[cls[w]] += nd;
          subs.repairBy[cls[w]] += nr;
          fx[w] = (fx[w] & ~newR) | newD;
        }
      }
    }
    const meanD = N ? sumD / N : 0;
    const meanN = N ? sumN / N : 0;
    this.last = {
      gen: this.gen,
      N,
      conceived: births ? births.conceived : 0,
      tried: births ? births.tried : 0,
      survived: births ? births.survived : 0,
      // share of the young that survived the genetic lottery
      survival: births && births.tried ? births.survived / births.tried : 1,
      meanD,
      varD: N > 1 ? Math.max(0, sumD2 / N - meanD * meanD) : 0,
      meanN,
      varN: N > 1 ? Math.max(0, sumN2 / N - meanN * meanN) : 0,
      minN: N ? minN : 0,
      atMin: N ? atMin : 0,
      brokenAll,
      fixedBy,
      poly,
      subsDamage: subs.damage,
      subsRepair: subs.repair,
      made: births ? this.made : 0,
      repaired: births ? this.repaired : 0,
      extinct: this.extinct,
    };
  }

  record(force) {
    const h = this.history;
    if (!force && this.gen % this.stride !== 0) return;
    const s = this.last;
    h.push({
      gen: s.gen,
      N: s.N,
      survival: s.survival,
      meanD: s.meanD,
      varD: s.varD,
      meanN: s.meanN,
      varN: s.varN,
      minN: s.minN,
      brokenAll: s.brokenAll,
      fixedBy: s.fixedBy,
      poly: s.poly,
      subsDamage: s.subsDamage,
      subsRepair: s.subsRepair,
    });
    if (h.length >= MAX_HISTORY) {
      // keep the first point and every other one after it
      const kept = [h[0]];
      for (let i = 2; i < h.length; i += 2) kept.push(h[i]);
      this.history = kept;
      this.stride *= 2;
    }
  }

  run(n) {
    for (let i = 0; i < n && !this.extinct; i++) this.step();
  }

  // Settings that can change during a run. The rest (places, genes,
  // chromosomes, effects) need a fresh start.
  setParams(patch) {
    const live = ['U', 'repair', 'F', 'h', 'epistasis', 'competition', 'males', 'crossovers', 'mode', 'years'];
    const clean = {};
    for (const k of live) if (k in patch && patch[k] !== this.params[k]) clean[k] = patch[k];
    if (!Object.keys(clean).length) return false;
    const before = this.params;
    const p = normalize({ ...before, ...clean });
    for (const k of Object.keys(clean)) clean[k] = p[k];
    this.params = { ...before, ...clean };
    const q = this.params;
    this.uGene = q.U / (2 * this.L);
    this.hitsDamage = q.U / 2;
    this.hitsRepair = (q.U / 2) * q.repair;
    this.capNext = q.competition > 0 ? 2 * q.K : q.K;
    if (clean.crossovers !== undefined || (clean.mode && clean.mode !== 'asex')) this.poolReady = false;
    if (clean.mode && before.mode === 'asex' && q.mode !== 'asex') {
      // clones become two sexes: each adult is assigned one at random
      for (let i = 0; i < this.N; i++) this.sex[i] = this.rng.u32() & 1;
    }
    if (clean.mode === 'asex') for (let i = 0; i < this.N; i++) this.sex[i] = 0;
    if (clean.h !== undefined) this.setDominance(q.h);
    else this.setupKernel();
    this.changes.push({ gen: this.gen, patch: clean });
    return true;
  }

  // Broken copies of every gene among the adults, counted 32 genes at a time
  // with bit-sliced counters (one bit of every count per word).
  counts(out = new Uint16Array(this.L)) {
    const { N, W, geno } = this;
    const H = 2 * N;
    const B = Math.max(1, 32 - Math.clz32(H));
    const c = new Int32Array(W * B);
    for (let k = 0; k < H; k++) {
      const o = k * W;
      for (let w = 0; w < W; w++) {
        let carry = geno[o + w];
        let j = w * B;
        const end = j + B;
        while (carry !== 0 && j < end) {
          const t = c[j] & carry;
          c[j] ^= carry;
          carry = t;
          j++;
        }
      }
    }
    for (let w = 0; w < W; w++) {
      const base = w * B;
      for (let b = 0; b < 32; b++) {
        let n = 0;
        for (let j = 0; j < B; j++) n |= ((c[base + j] >>> b) & 1) << j;
        out[(w << 5) + b] = n;
      }
    }
    return out;
  }

  // Share of copies broken, gene by gene, over all adults.
  frequencies(out = new Float32Array(this.L)) {
    if (this.N === 0) return out.fill(0);
    const c = this.counts();
    const H = 2 * this.N;
    for (let g = 0; g < this.L; g++) out[g] = c[g] / H;
    return out;
  }

  // A fingerprint of the whole population, for reproducibility checks.
  hash() {
    let h = 0x811c9dc5 ^ this.N;
    const n = 2 * this.N * this.W;
    for (let i = 0; i < n; i++) h = Math.imul(h ^ this.geno[i], 0x01000193);
    return (h >>> 0).toString(16);
  }
}

export { DEFAULTS };
