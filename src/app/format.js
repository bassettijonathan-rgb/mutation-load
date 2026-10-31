// Numbers as people read them.

export function int(x) {
  if (!Number.isFinite(x)) return '–';
  return Math.round(x)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function fixed(x, d = 1) {
  if (!Number.isFinite(x)) return '–';
  const s = x.toFixed(d);
  const [a, b] = s.split('.');
  const head = a.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return b ? `${head}.${b}` : head;
}

export function pct(x, d = 1) {
  if (!Number.isFinite(x)) return '–';
  return `${(100 * x).toFixed(d)} %`;
}

// A count with one decimal when small, none when large.
export function count(x) {
  if (!Number.isFinite(x)) return '–';
  return Math.abs(x) < 100 ? fixed(x, 1) : int(x);
}

// Years: "975 years", "12,500 years", "1.25 million years".
export function years(y) {
  if (!Number.isFinite(y)) return '–';
  if (y >= 1e6) return `${fixed(y / 1e6, y >= 1e7 ? 1 : 2)} million years`;
  return `${int(y)} years`;
}

// Short form for chart axes: 0, 500, 25k, 1.5M.
export function short(y) {
  if (y === 0) return '0';
  if (y >= 1e6) return `${+(y / 1e6).toFixed(2)}M`;
  if (y >= 1e3) return `${+(y / 1e3).toFixed(1)}k`;
  return String(Math.round(y));
}

// An effect s as a percentage with sensible digits: 5 %, 0.25 %, 0.0004 %.
export function effect(s) {
  if (!(s > 0)) return '0 %';
  const p = 100 * s;
  if (p >= 10) return `${p.toFixed(0)} %`;
  if (p >= 1) return `${+p.toFixed(1)} %`;
  const digits = Math.min(8, Math.max(1, -Math.floor(Math.log10(p)) + 1));
  return `${+p.toFixed(digits)} %`;
}

// One in N, for small chances: "1 in 4,000".
export function oneIn(p) {
  if (!(p > 0)) return 'never';
  if (p >= 0.5) return pct(p, 0);
  return `1 in ${int(1 / p)}`;
}

export function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
