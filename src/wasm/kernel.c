// The breeding loop of src/sim/engine.js (function breed), in C for
// WebAssembly. It must give exactly the same results as the JavaScript
// version: the same random draws in the same order and the same floating
// point operations in the same order. test/unit/kernel.test.js checks it.
//
// Build: node tools/build-wasm.mjs (needs clang with the wasm32 target).

typedef unsigned int u32;
typedef int i32;

__attribute__((import_module("env"), import_name("log"))) double js_log(double);

// set once by setup()
static i32 W, C, WPC, L, POOL, CAP, MONOTONE;
static double EPS, HITS_D, E_HITS_D, HITS_R, E_HITS_R;
static i32 *POOLP, *FEM, *MAL, *MUT_G, *PICK, *OR_M, *AND_M;
static unsigned char *MUT_K;
static double *C1, *C2, *OUT;
static u32 *RNG; // sfc32 state a, b, c, d

void setup(i32 w, i32 c, i32 wpc, i32 l, i32 pool, i32 cap, i32 monotone, double eps, double hitsD,
           double eHitsD, double hitsR, double eHitsR, i32 poolP, i32 fem, i32 mal, i32 mutG, i32 mutK,
           i32 pick, i32 c1, i32 c2, i32 orM, i32 andM, i32 out, i32 rng) {
  W = w;
  C = c;
  WPC = wpc;
  L = l;
  POOL = pool;
  CAP = cap;
  MONOTONE = monotone;
  EPS = eps;
  HITS_D = hitsD;
  E_HITS_D = eHitsD;
  HITS_R = hitsR;
  E_HITS_R = eHitsR;
  POOLP = (i32 *)poolP;
  FEM = (i32 *)fem;
  MAL = (i32 *)mal;
  MUT_G = (i32 *)mutG;
  MUT_K = (unsigned char *)mutK;
  PICK = (i32 *)pick;
  C1 = (double *)c1;
  C2 = (double *)c2;
  OR_M = (i32 *)orM;
  AND_M = (i32 *)andM;
  OUT = (double *)out;
  RNG = (u32 *)rng;
}

static u32 ra, rb, rc, rd;

static inline u32 next_u32(void) {
  u32 t = ra + rb + rd;
  rd = rd + 1;
  ra = rb ^ (rb >> 9);
  rb = rc + (rc << 3);
  rc = (rc << 21) | (rc >> 11);
  rc = rc + t;
  return t;
}

static inline double next_float(void) { return (double)next_u32() / 4294967296.0; }

static inline i32 next_int(i32 n) {
  double x = ((double)next_u32() / 4294967296.0) * (double)n;
  return (i32)__builtin_floor(x);
}

static inline i32 popcnt(u32 x) { return __builtin_popcount(x); }

void breed(i32 genoP, i32 nextP, i32 dmgP, i32 cntP, i32 sexP, double conceived, i32 nF, i32 nM, i32 asex) {
  i32 *geno = (i32 *)genoP;
  i32 *next = (i32 *)nextP;
  double *nextDmg = (double *)dmgP;
  i32 *nextCnt = (i32 *)cntP;
  unsigned char *nextSex = (unsigned char *)sexP;
  const i32 W2 = 2 * W;
  const i32 PW = POOL * WPC;
  i32 made = 0, repaired = 0, survived = 0;
  double tried = 0;
  ra = RNG[0];
  rb = RNG[1];
  rc = RNG[2];
  rd = RNG[3];

  while (tried < conceived && survived < CAP) {
    tried += 1;
    const double E = -js_log(1 - next_float());
    const double limit = EPS > 0 ? (__builtin_sqrt(1 + 2 * EPS * E) - 1) / EPS : E;
    const i32 d0 = survived * W2;
    const i32 d1 = d0 + W;
    const i32 ma = FEM[next_int(nF)] * W2;
    const i32 pa = asex ? ma : MAL[next_int(nM)] * W2;
    if (!asex) {
      for (i32 i = 0; i < 2 * C; i += 4) {
        const u32 r = next_u32();
        PICK[i] = r & 255;
        PICK[i + 1] = (r >> 8) & 255;
        PICK[i + 2] = (r >> 16) & 255;
        PICK[i + 3] = r >> 24;
      }
    }

    i32 nmM = 0, nmP = 0;
    for (i32 side = 0; side < 2; side++) {
      const i32 base = side << 6;
      i32 n = 0;
      for (i32 kind = 1; kind >= 0; kind--) {
        const double mean = kind ? HITS_D : HITS_R;
        if (mean <= 0) continue;
        double pk = kind ? E_HITS_D : E_HITS_R;
        double cum = pk;
        const double u = next_float();
        i32 k = 0;
        while (u > cum && k < 60) {
          k++;
          pk *= mean / k;
          cum += pk;
        }
        for (i32 i = 0; i < k && n < 64; i++) {
          const i32 g = next_int(L);
          i32 j = n;
          while (j > 0 && MUT_G[base + j - 1] > g) {
            MUT_G[base + j] = MUT_G[base + j - 1];
            MUT_K[base + j] = MUT_K[base + j - 1];
            j--;
          }
          MUT_G[base + j] = g;
          MUT_K[base + j] = (unsigned char)kind;
          n++;
        }
      }
      if (side == 0) nmM = n;
      else nmP = n;
    }

    double D = 0;
    i32 cnt = 0;
    i32 iM = 0, iP = 64;
    const i32 endP = 64 + nmP;
    i32 dead = 0;
    for (i32 c = 0; c < C; c++) {
      const i32 w0 = c * WPC;
      const i32 w1 = w0 + WPC;
      if (asex) {
        for (i32 w = w0; w < w1; w++) {
          next[d0 + w] = geno[ma + w];
          next[d1 + w] = geno[ma + W + w];
        }
      } else {
        const i32 om = c * PW + PICK[c] * WPC - w0;
        const i32 op = c * PW + PICK[C + c] * WPC - w0;
        const i32 mb = ma + W;
        const i32 pb = pa + W;
        for (i32 w = w0; w < w1; w++) {
          const i32 m = POOLP[om + w];
          const i32 q = POOLP[op + w];
          next[d0 + w] = (geno[ma + w] & ~m) | (geno[mb + w] & m);
          next[d1 + w] = (geno[pa + w] & ~q) | (geno[pb + w] & q);
        }
      }
      while (iM < nmM && ((u32)MUT_G[iM] >> 5) < (u32)w1) {
        const i32 g = MUT_G[iM];
        const i32 i = d0 + (g >> 5);
        const i32 bit = (i32)(1u << (g & 31));
        const i32 x = next[i];
        if (MUT_K[iM]) {
          if ((x & bit) == 0) {
            next[i] = x | bit;
            made++;
          }
        } else if ((x & bit) != 0) {
          next[i] = x ^ bit;
          repaired++;
        }
        iM++;
      }
      while (iP < endP && ((u32)MUT_G[iP] >> 5) < (u32)w1) {
        const i32 g = MUT_G[iP];
        const i32 i = d1 + (g >> 5);
        const i32 bit = (i32)(1u << (g & 31));
        const i32 x = next[i];
        if (MUT_K[iP]) {
          if ((x & bit) == 0) {
            next[i] = x | bit;
            made++;
          }
        } else if ((x & bit) != 0) {
          next[i] = x ^ bit;
          repaired++;
        }
        iP++;
      }
      for (i32 w = w0; w < w1; w++) {
        const u32 x = (u32)next[d0 + w];
        const u32 y = (u32)next[d1 + w];
        const u32 het = x ^ y;
        const u32 hom = x & y;
        if ((het | hom) != 0) {
          const i32 a = popcnt(het);
          const i32 b = popcnt(hom);
          D -= (double)a * C1[w] + (double)b * C2[w];
          cnt += a + 2 * b;
        }
      }
      if (MONOTONE && D > limit) {
        dead = 1;
        break;
      }
    }
    if (dead || D > limit) continue;
    for (i32 w = 0; w < W; w++) {
      const i32 x = next[d0 + w];
      const i32 y = next[d1 + w];
      OR_M[w] |= x | y;
      AND_M[w] &= x & y;
    }
    nextDmg[survived] = D;
    nextCnt[survived] = cnt;
    nextSex[survived] = asex ? 0 : (unsigned char)(next_u32() & 1);
    survived++;
  }
  RNG[0] = ra;
  RNG[1] = rb;
  RNG[2] = rc;
  RNG[3] = rd;
  OUT[0] = tried;
  OUT[1] = survived;
  OUT[2] = made;
  OUT[3] = repaired;
}
