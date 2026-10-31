// Seeded random numbers (sfc32). The same seed gives the same stream on
// every run, which is what makes a whole simulation reproducible.

export function hash32(seed) {
  const s = String(seed);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rng {
  constructor(seed = 1) {
    const h = hash32(seed);
    this.a = h;
    this.b = (h ^ 0x9e3779b9) >>> 0;
    this.c = (h ^ 0x243f6a88) >>> 0;
    this.d = 1;
    for (let i = 0; i < 16; i++) this.u32();
  }

  u32() {
    const a = this.a;
    const b = this.b;
    const c = this.c;
    const d = this.d;
    const t = (((a + b) | 0) + d) | 0;
    this.d = (d + 1) | 0;
    this.a = b ^ (b >>> 9);
    this.b = (c + (c << 3)) | 0;
    const r = (c << 21) | (c >>> 11);
    this.c = (r + t) | 0;
    return t >>> 0;
  }

  // uniform in [0, 1)
  float() {
    return this.u32() / 4294967296;
  }

  // uniform integer in [0, n)
  int(n) {
    return Math.floor((this.u32() / 4294967296) * n);
  }

  normal() {
    const u = 1 - this.float();
    const v = this.float();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // Poisson by inversion for small means (mutations, crossovers: the usual
  // case), a rounded normal for large ones (total births).
  poisson(mean) {
    if (!(mean > 0)) return 0;
    if (mean < 40) {
      let p = Math.exp(-mean);
      let cum = p;
      const u = this.float();
      let k = 0;
      while (u > cum && k < 400) {
        k++;
        p *= mean / k;
        cum += p;
      }
      return k;
    }
    return Math.max(0, Math.round(mean + Math.sqrt(mean) * this.normal()));
  }
}
