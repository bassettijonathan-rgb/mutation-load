// The genome map: every gene of the population as one small square, coloured
// by the share of its copies that are broken across all the adults. Two
// layouts: genes sorted from most to least harmful, or in their places along
// the chromosomes.

function mix(a, b, t) {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
}

function rgbOf(css) {
  const m = /^#?([0-9a-f]{6})$/i.exec(css.trim());
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const r = /rgba?\(([^)]+)\)/.exec(css);
  if (r) return r[1].split(',').slice(0, 3).map((x) => Math.round(parseFloat(x)));
  return [128, 128, 128];
}

export class GenomeMap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.view = 'effect';
    this.freq = null;
    this.selected = -1;
    this.layout = null;
    this.W = 0;
    this.H = 0;
  }

  setGenome({ L, C, sFam, classes }) {
    this.L = L;
    this.C = C;
    this.G = L / C;
    this.sFam = sFam;
    this.classes = classes;
    // genes sorted by effect, most harmful first (families stay together)
    const fams = sFam.map((s, i) => i).sort((a, b) => sFam[b] - sFam[a] || a - b);
    this.order = new Int32Array(L);
    let k = 0;
    for (const f of fams) for (let b = 0; b < 32; b++) this.order[k++] = f * 32 + b;
    this.rank = new Int32Array(L);
    for (let i = 0; i < L; i++) this.rank[this.order[i]] = i;
    this.freq = new Float32Array(L);
    this.layout = null;
  }

  setCounts(counts, N) {
    if (!counts || !this.freq) return;
    const H = 2 * N;
    for (let g = 0; g < this.L; g++) this.freq[g] = H > 0 ? counts[g] / H : 0;
  }

  classOfGene(g) {
    const s = this.sFam[g >> 5];
    for (let i = 0; i < this.classes.length; i++) if (s >= this.classes[i].min) return i;
    return this.classes.length - 1;
  }

  // Sizes the canvas to its width and works out where every gene goes.
  resize() {
    const W = Math.max(1, this.canvas.parentElement.getBoundingClientRect().width);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let H;
    if (this.view === 'effect') {
      const label = W < 420 ? 50 : 60; // room for the class names on the right
      const area = W - label;
      const hMax = Math.min(380, Math.max(200, 0.75 * W));
      const cs = Math.max(1.5, Math.min(9, Math.sqrt((area * hMax) / this.L)));
      const cols = Math.max(8, Math.floor(area / cs));
      const rows = Math.ceil(this.L / cols);
      const cell = area / cols;
      H = Math.ceil(rows * cell) + 2;
      this.layout = { kind: 'effect', cols, rows, cell, area, label };
    } else {
      const side = Math.ceil(Math.sqrt(this.G));
      const gap = 8;
      const head = 13;
      let per = Math.max(1, Math.min(this.C, Math.floor((W + gap) / (side * 3.6 + gap))));
      // fill the rows evenly
      const rowsOfBlocks = Math.ceil(this.C / per);
      per = Math.ceil(this.C / rowsOfBlocks);
      const block = (W - gap * (per - 1)) / per;
      const cell = block / side;
      H = Math.ceil(rowsOfBlocks * (block + head + gap));
      this.layout = { kind: 'chrom', side, gap, head, per, block, cell, rowsOfBlocks };
    }
    this.W = W;
    this.H = H;
    this.canvas.style.height = `${H}px`;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // top-left corner and size of gene g's square
  cellOf(g) {
    const l = this.layout;
    if (l.kind === 'effect') {
      const r = this.rank[g];
      const row = Math.floor(r / l.cols);
      const col = r % l.cols;
      return [col * l.cell, row * l.cell, l.cell];
    }
    const c = Math.floor(g / this.G);
    const i = g % this.G;
    const bx = c % l.per;
    const by = Math.floor(c / l.per);
    const x = bx * (l.block + l.gap) + (i % l.side) * l.cell;
    const y = by * (l.block + l.head + l.gap) + l.head + Math.floor(i / l.side) * l.cell;
    return [x, y, l.cell];
  }

  geneAt(px, py) {
    const l = this.layout;
    if (!l) return -1;
    if (l.kind === 'effect') {
      if (px < 0 || px >= l.area) return -1;
      const col = Math.floor(px / l.cell);
      const row = Math.floor(py / l.cell);
      const r = row * l.cols + col;
      return r >= 0 && r < this.L ? this.order[r] : -1;
    }
    const bx = Math.floor(px / (l.block + l.gap));
    const by = Math.floor(py / (l.block + l.head + l.gap));
    const c = by * l.per + bx;
    if (bx >= l.per || c < 0 || c >= this.C) return -1;
    const ix = Math.floor((px - bx * (l.block + l.gap)) / l.cell);
    const iy = Math.floor((py - by * (l.block + l.head + l.gap) - l.head) / l.cell);
    if (ix < 0 || ix >= l.side || iy < 0 || iy >= l.side) return -1;
    const i = iy * l.side + ix;
    return i < this.G ? c * this.G + i : -1;
  }

  draw(colors) {
    const ctx = this.ctx;
    const l = this.layout;
    if (!l || !this.freq) return;
    ctx.clearRect(0, 0, this.W, this.H);
    const c0 = rgbOf(colors.cell0);
    const c1 = rgbOf(colors.cell1);
    const cF = rgbOf(colors.cellFixed);
    // a few colour steps are plenty and much cheaper than one per gene
    // shade by the broken share, slightly stretched so that the few broken
    // copies of severe genes still show
    const STEPS = 32;
    const palette = [];
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      palette.push(`rgb(${mix(c0, c1, 0.07 + 0.93 * t).join(',')})`);
    }
    const fixed = `rgb(${cF.join(',')})`;
    const clean = `rgb(${c0.join(',')})`;
    const groups = new Map();
    for (let g = 0; g < this.L; g++) {
      const f = this.freq[g];
      const key = f <= 0 ? clean : f >= 1 ? fixed : palette[Math.round(Math.pow(f, 0.75) * STEPS)];
      let arr = groups.get(key);
      if (!arr) groups.set(key, (arr = []));
      arr.push(g);
    }
    const pad = l.cell > 3 ? 0.5 : 0;
    for (const [color, genes] of groups) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (const g of genes) {
        const [x, y, s] = this.cellOf(g);
        ctx.rect(x, y, s - pad, s - pad);
      }
      ctx.fill();
    }

    ctx.font = '600 10.5px "Atkinson Hyperlegible", system-ui, sans-serif';
    ctx.textBaseline = 'top';
    if (l.kind === 'effect') {
      // where each effect class starts, marked on the right
      let start = 0;
      const counts = this.classes.map(() => 0);
      for (let g = 0; g < this.L; g++) counts[this.classOfGene(g)]++;
      ctx.textAlign = 'left';
      let lastY = -20;
      this.classes.forEach((c, i) => {
        if (!counts[i]) return;
        const row = Math.floor(start / l.cols);
        const y = row * l.cell;
        if (start > 0) {
          ctx.strokeStyle = colors.ink2;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          const col = start % l.cols;
          // a step line between the classes
          ctx.moveTo(0, y + l.cell);
          ctx.lineTo(col * l.cell, y + l.cell);
          ctx.lineTo(col * l.cell, y);
          ctx.lineTo(l.area, y);
          ctx.stroke();
        }
        const ty = Math.max(y + 1, lastY + 13);
        ctx.fillStyle = colors[`c${i}`];
        ctx.fillRect(l.area + 6, ty + 1, 7, 7);
        ctx.fillStyle = colors.ink2;
        ctx.fillText(c.label, l.area + 16, ty);
        lastY = ty;
        start += counts[i];
      });
    } else {
      ctx.textAlign = 'left';
      ctx.fillStyle = colors.ink3;
      for (let c = 0; c < this.C; c++) {
        const bx = c % l.per;
        const by = Math.floor(c / l.per);
        ctx.fillText(`${c + 1}`, bx * (l.block + l.gap), by * (l.block + l.head + l.gap));
      }
    }

    if (this.selected >= 0) {
      const [x, y, s] = this.cellOf(this.selected);
      ctx.strokeStyle = colors.focus;
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 2, y - 2, s + 3, s + 3);
    }
  }
}
