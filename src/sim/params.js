// Default settings, their allowed ranges, and the ready-made scenarios.

export const DEFAULTS = {
  K: 2000, // places for adults (the most adults the habitat can hold)
  F: 10, // conceptions per female per generation
  genes: 5120, // genes per genome (a multiple of 32 × chromosomes)
  chromosomes: 20,
  U: 1, // new damaging mutations per diploid genome per generation
  repair: 0.1, // repair mutations, as a fraction of the damage rate per gene
  dfe: 'human', // a key of DFE_PRESETS, or 'custom'
  shape: 0.2, // gamma shape (custom DFE)
  meanS: 0.01, // gamma mean effect (custom DFE)
  fixedS: 0.01, // single effect for every gene (custom 'fixed' DFE)
  h: 0.25, // dominance: one broken copy costs h × s
  crossovers: 1.5, // per chromosome per meiosis
  mode: 'sex', // 'sex' | 'nocross' (sex without crossing over) | 'asex' (clones)
  epistasis: 0, // synergy: log fitness = -D - epistasis·D²/2
  competition: 0, // 0: places go by luck; >0: healthier young win places more often
  males: 0, // selection on males: 0 random fathers; >0 healthier males father more young
  years: 25, // years per generation (only for the clock)
};

export const RANGES = {
  K: [50, 10000],
  F: [2.2, 100],
  genes: [640, 20480],
  U: [0, 5],
  repair: [0, 1],
  shape: [0.05, 5],
  meanS: [1e-5, 0.5],
  fixedS: [1e-6, 0.99],
  h: [0, 1],
  crossovers: [0, 4],
  epistasis: [0, 10],
  competition: [0, 10],
  males: [0, 10],
  years: [1, 40],
};

export const GENE_CHOICES = [1280, 2560, 5120, 10240, 20480];

// Keep settings inside their ranges and the genome a whole number of words
// per chromosome.
export function normalize(p) {
  const q = { ...DEFAULTS, ...p };
  for (const [k, [lo, hi]] of Object.entries(RANGES)) {
    const v = Number(q[k]);
    q[k] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : DEFAULTS[k];
  }
  q.K = Math.round(q.K);
  q.chromosomes = Math.min(32, Math.max(1, Math.round(Number(q.chromosomes) || DEFAULTS.chromosomes)));
  const unit = 32 * q.chromosomes;
  q.genes = Math.max(unit, Math.round(q.genes / unit) * unit);
  if (!['sex', 'nocross', 'asex'].includes(q.mode)) q.mode = 'sex';
  return q;
}

// Years as people say them.
export function yearsOf(gen, years = DEFAULTS.years) {
  return gen * years;
}
