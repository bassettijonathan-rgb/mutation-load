// The run so far as stacked charts on one shared time axis, with what
// theory predicts drawn as dashed lines, and an optional earlier run in grey
// for comparison.

import * as fmt from './format.js';

export const PANELS = [
  {
    id: 'survival',
    title: 'Young that survive their genes',
    min: 0,
    max: 1,
    ticks: [0, 0.25, 0.5, 0.75, 1],
    tick: (v) => `${Math.round(v * 100)}%`,
    series: [{ key: 'survival', color: 'rust', width: 1.4 }],
    theory: [
      { key: 'haldane', color: 'ink2', dash: [5, 4], label: 'e⁻ᵁ' },
      { key: 'forecast', color: 'teal', dash: [2, 3], label: 'forecast' },
      { key: 'needed', color: 'bad', dash: [6, 3], label: 'needed' },
    ],
  },
  {
    id: 'copies',
    title: 'Broken copies per genome',
    auto: true,
    series: [
      { key: 'meanN', color: 'ink', width: 1.8, label: 'average' },
      { key: 'minN', color: 'amber', width: 1.2, label: 'fewest' },
    ],
    theory: [{ key: 'forecastCopies', color: 'teal', dash: [2, 3], label: 'forecast' }],
  },
  {
    id: 'fixed',
    title: 'Genes broken in every genome',
    short: 'Broken in every genome',
    auto: true,
    stack: true,
    series: [
      { idx: 3, color: 'c3', label: 'tiny' },
      { idx: 2, color: 'c2', label: 'slight' },
      { idx: 1, color: 'c1', label: 'mild' },
      { idx: 0, color: 'c0', label: 'severe' },
    ],
    theory: [{ key: 'forecastFixed', color: 'teal', dash: [2, 3], label: 'forecast' }],
  },
  {
    id: 'adults',
    title: 'Adults',
    min: 0,
    maxKey: 'K',
    series: [{ key: 'N', color: 'sky', width: 1.6 }],
  },
];

const PAD = { left: 44, right: 10, title: 19, keys: 14, gap: 10, axis: 24 };

function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function niceTicks(max, n = 4) {
  const step = niceMax(max / n);
  const out = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(v);
  return out;
}

export class Charts {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.points = [];
    this.ghost = null; // {label, points}
    this.theory = []; // [{gen, values}] from the start and each change
    this.K = 2000;
    this.years = 25;
    this.log = false;
    this.cursor = null; // generation under the pointer
    this.W = 0;
    this.H = 0;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.max(1, r.width);
    this.H = Math.max(1, r.height);
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = PANELS.length;
    const weights = [1.25, 1, 1, 0.6];
    const total = weights.reduce((a, b) => a + b, 0);
    const avail = this.H - PAD.axis;
    // on narrow screens the keys get a line of their own under the title
    this.narrow = this.W < 600;
    let y = 0;
    this.boxes = PANELS.map((p, i) => {
      const row = (avail * weights[i]) / total;
      const head = PAD.title + (this.narrow && p.series.length > 1 ? PAD.keys : 0);
      const box = { panel: p, y: y + head, h: row - head - PAD.gap };
      y += row;
      return box;
    });
    this.axisY = avail;
  }

  get lastGen() {
    const P = this.points;
    return P.length ? P[P.length - 1].gen : 0;
  }

  span() {
    const g = Math.max(this.lastGen, this.ghost ? this.ghost.points[this.ghost.points.length - 1]?.gen ?? 0 : 0);
    if (this.log) return [1, Math.max(10, Math.pow(10, Math.ceil(Math.log10(Math.max(g, 10)) * 2) / 2))];
    return [0, niceMax(Math.max(g, 100))];
  }

  x(gen) {
    const [a, b] = this.span();
    const t = this.log ? (Math.log10(Math.max(gen, 1)) - Math.log10(a)) / (Math.log10(b) - Math.log10(a)) : (gen - a) / (b - a);
    return PAD.left + Math.min(1, Math.max(0, t)) * (this.W - PAD.left - PAD.right);
  }

  genAt(px) {
    const [a, b] = this.span();
    const t = Math.min(1, Math.max(0, (px - PAD.left) / (this.W - PAD.left - PAD.right)));
    return this.log ? Math.pow(10, Math.log10(a) + t * (Math.log10(b) - Math.log10(a))) : a + t * (b - a);
  }

  pointAt(gen) {
    const P = this.points;
    if (!P.length) return null;
    let lo = 0;
    let hi = P.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (P[mid].gen < gen) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(P[lo - 1].gen - gen) < Math.abs(P[lo].gen - gen)) lo--;
    return P[lo];
  }

  // value of a theory line at a generation (the settings in force then)
  theoryAt(gen, key) {
    let v = null;
    for (const t of this.theory) if (t.gen <= gen) v = t.values[key];
    return v;
  }

  value(q, s) {
    if (s.idx !== undefined) return q.fixedBy ? q.fixedBy[s.idx] : 0;
    return q[s.key];
  }

  draw(colors) {
    const ctx = this.ctx;
    const { W } = this;
    if (!this.boxes) return;
    ctx.clearRect(0, 0, W, this.H);
    const P = this.points;
    const G = this.ghost?.points ?? [];
    const x0 = PAD.left;
    const x1 = W - PAD.right;
    const font = (s, w = 400) => `${w} ${s}px "Atkinson Hyperlegible", system-ui, sans-serif`;
    const mono = (s) => `${s}px "IBM Plex Mono", ui-monospace, monospace`;
    const stride = Math.max(1, Math.floor(P.length / Math.max(200, x1 - x0)));

    for (const box of this.boxes) {
      const p = box.panel;
      // the range
      let max = p.max ?? 1;
      if (p.maxKey === 'K') max = this.K;
      if (p.auto) {
        let m = 0;
        const scan = (arr) => {
          for (const q of arr) {
            if (p.stack) {
              let s = 0;
              for (const se of p.series) s += this.value(q, se);
              m = Math.max(m, s);
            } else for (const se of p.series) m = Math.max(m, this.value(q, se) ?? 0);
          }
        };
        scan(P);
        scan(G);
        for (const t of this.theory) for (const th of p.theory ?? []) if (t.values[th.key] != null) m = Math.max(m, t.values[th.key]);
        max = niceMax(Math.max(m * 1.08, 4));
      }
      const min = p.min ?? 0;
      const yOf = (v) => box.y + box.h - Math.min(1, Math.max(0, (v - min) / (max - min))) * box.h;
      const ticks = p.ticks ?? niceTicks(max, box.h < 70 ? 2 : 3);

      ctx.fillStyle = colors.plot;
      ctx.fillRect(x0, box.y, x1 - x0, box.h);
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 1;
      ctx.font = mono(9.5);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const t of ticks) {
        const y = Math.round(yOf(t)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
        ctx.fillStyle = colors.ink3;
        ctx.fillText(p.tick ? p.tick(t) : fmt.short(t), x0 - 5, y);
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, box.y, x1 - x0, box.h);
      ctx.clip();

      // the earlier run, in grey
      if (G.length) {
        ctx.strokeStyle = colors.ghost;
        ctx.lineWidth = 1.4;
        for (const s of p.stack ? [{ total: true }] : p.series.slice(0, 1)) {
          ctx.beginPath();
          G.forEach((q, i) => {
            const v = s.total ? p.series.reduce((a, se) => a + this.value(q, se), 0) : this.value(q, s);
            const X = this.x(q.gen);
            const Y = yOf(v);
            if (i === 0) ctx.moveTo(X, Y);
            else ctx.lineTo(X, Y);
          });
          ctx.stroke();
        }
      }

      // the data
      const idx = [];
      for (let i = 0; i < P.length; i += stride) idx.push(i);
      if (P.length && idx[idx.length - 1] !== P.length - 1) idx.push(P.length - 1);
      if (p.stack && P.length) {
        const base = new Float64Array(P.length);
        for (const s of p.series) {
          ctx.beginPath();
          idx.forEach((i, k) => {
            const q = P[i];
            const X = this.x(q.gen);
            const Y = yOf(base[i] + this.value(q, s));
            if (k === 0) ctx.moveTo(X, Y);
            else ctx.lineTo(X, Y);
          });
          for (let k = idx.length - 1; k >= 0; k--) ctx.lineTo(this.x(P[idx[k]].gen), yOf(base[idx[k]]));
          ctx.closePath();
          ctx.fillStyle = colors[s.color];
          ctx.fill();
          for (let i = 0; i < P.length; i++) base[i] += this.value(P[i], s);
        }
      } else {
        for (const s of p.series) {
          if (!P.length) continue;
          ctx.beginPath();
          let px = -1;
          P.forEach((q, i) => {
            const X = this.x(q.gen);
            if (i > 0 && X - px < 0.6 && i < P.length - 1) return;
            px = X;
            const Y = yOf(this.value(q, s));
            if (i === 0) ctx.moveTo(X, Y);
            else ctx.lineTo(X, Y);
          });
          ctx.strokeStyle = colors[s.color];
          ctx.lineWidth = s.width ?? 1.6;
          ctx.lineJoin = 'round';
          ctx.stroke();
        }
      }

      // theory: piecewise, as the settings were at each moment
      for (const th of p.theory ?? []) {
        ctx.strokeStyle = colors[th.color];
        ctx.lineWidth = 1.3;
        ctx.setLineDash(th.dash);
        const end = Math.max(this.lastGen, 1);
        this.theory.forEach((t, i) => {
          const v = t.values[th.key];
          if (v == null) return;
          const a = t.gen;
          const b = i + 1 < this.theory.length ? this.theory[i + 1].gen : end;
          const xa = this.log ? this.x(Math.max(a, 1)) : this.x(a);
          const xb = i + 1 < this.theory.length ? this.x(b) : x1;
          const y = Math.round(yOf(v)) + 0.5;
          ctx.beginPath();
          ctx.moveTo(xa, y);
          ctx.lineTo(xb, y);
          ctx.stroke();
        });
        ctx.setLineDash([]);
      }
      // labels for the theory lines, at the right end, kept apart
      const labels = [];
      for (const th of p.theory ?? []) {
        const t = this.theory[this.theory.length - 1];
        const v = t?.values[th.key];
        if (v == null || !th.label) continue;
        labels.push({ y: yOf(v), text: th.label, color: colors[th.color] });
      }
      labels.sort((a, b) => a.y - b.y);
      ctx.font = font(10.5, 700);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      let prev = -Infinity;
      for (const l of labels) {
        let y = Math.max(l.y - 2, box.y + 11);
        if (y - prev < 11) y = prev + 11;
        prev = y;
        const w = ctx.measureText(l.text).width;
        ctx.fillStyle = colors.plotFade;
        ctx.fillRect(x1 - w - 6, y - 11, w + 5, 11);
        ctx.fillStyle = l.color;
        ctx.fillText(l.text, x1 - 3, y);
      }
      ctx.restore();

      // title and key, above the plot
      ctx.font = font(12, 700);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const twoLines = this.narrow && p.series.length > 1;
      const ty = box.y - 6 - (twoLines ? PAD.keys : 0);
      ctx.fillStyle = colors.ink2;
      const title = this.narrow && p.short ? p.short : p.title;
      ctx.fillText(title, x0, ty);
      let tx = twoLines ? x0 : x0 + ctx.measureText(title).width + 10;
      const ky = twoLines ? box.y - 5 : ty;
      ctx.font = font(10.5);
      const keys = [];
      if (p.series.length > 1) for (const s of p.series) keys.push({ color: colors[s.color], label: s.label, solid: true });
      for (const k of keys) {
        const w = ctx.measureText(k.label).width + 22;
        if (tx + w > x1) break;
        ctx.fillStyle = k.color;
        ctx.fillRect(tx, ky - 7, 9, 7);
        ctx.fillStyle = colors.ink3;
        ctx.fillText(k.label, tx + 12, ky);
        tx += w;
      }
    }

    // the time axis, in years
    const ay = this.axisY;
    ctx.strokeStyle = colors.ink3;
    ctx.fillStyle = colors.ink3;
    ctx.font = mono(10);
    ctx.textBaseline = 'top';
    const [a, b] = this.span();
    const ticks = [];
    if (this.log) {
      for (let e = 0; Math.pow(10, e) <= b; e++) ticks.push(Math.pow(10, e));
    } else {
      const step = niceMax(b / (W < 560 ? 4 : 6));
      for (let g = 0; g <= b + 1e-9; g += step) ticks.push(g);
    }
    ticks.forEach((g, i) => {
      if (g < a) return;
      const X = Math.round(this.x(g)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(X, ay - 4);
      ctx.lineTo(X, ay);
      ctx.stroke();
      ctx.textAlign = i === 0 ? 'left' : X > x1 - 20 ? 'right' : 'center';
      ctx.fillText(fmt.short(g * this.years), X, ay + 3);
    });
    ctx.textAlign = 'left';
    ctx.fillText('years', 4, ay + 3);

    // the cursor
    if (this.cursor !== null && P.length) {
      const X = Math.round(this.x(this.cursor)) + 0.5;
      ctx.strokeStyle = colors.ink;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X, this.boxes[0].y);
      ctx.lineTo(X, ay);
      ctx.stroke();
    }
  }
}
