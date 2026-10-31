// The page: wires the simulation (in a worker) to the readouts, the genome
// map, the charts and the Learn, Lab and Validation tabs.

import { createHost } from './host.js';
import { Charts } from './charts.js';
import { GenomeMap } from './genome.js';
import { CHAPTERS, GLOSSARY, READOUTS, linkify, narrate, geneCard } from './guide.js';
import { CHECKS, checkCost } from './validation.js';
import * as fmt from './format.js';
import { SPEEDS } from './server.js';
import { DEFAULTS, GENE_CHOICES } from '../sim/params.js';

/* global __VALIDATION__ */
const BUILT = typeof __VALIDATION__ === 'object' ? __VALIDATION__ : null;

const DEFAULT_SEED = 'genome';
const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const store = {
  get(k) {
    try {
      return localStorage.getItem(`mutation-load:${k}`);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(`mutation-load:${k}`, v);
    } catch {
      /* private mode: fine */
    }
  },
};

const ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z"/></svg>',
  step: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5v14l10-7zM16 5h3v14h-3z"/></svg>',
  restart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a7 7 0 1 1-6.6 4.7l1.9.6A5 5 0 1 0 12 7v3L7.5 6 12 2z"/></svg>',
};

const SPEED_LABELS = ['Slow', 'Medium', 'Fast', 'Max'];

const JUMPS = [100000, 500000, 1000000, 2000000];

const SCENARIOS = [
  { id: 'default', title: 'Vertebrate-like', text: '2,000 adults, 10 young per mother, one new damaging mutation per newborn, effects spread like real ones. Start here.', params: {} },
  { id: 'severe', title: 'Every gene severe', text: 'Every broken gene costs 5 %. The textbook case: survival settles at e^−U.', params: { dfe: 'strong' } },
  { id: 'mild', title: 'Every gene mild', text: 'Every gene costs 0.5 %: ten times more broken copies, the same price.', params: { dfe: 'mild' } },
  { id: 'weak', title: 'Every gene at the drift barrier', text: 'Every gene costs 0.05 %: too little to protect, enough to hurt in sum. Slow meltdown (Kondrashov’s worry).', params: { dfe: 'weak' } },
  { id: 'tiny', title: 'Every gene tiny', text: 'Every gene costs 0.002 %: nearly all rot, and it hardly matters.', params: { dfe: 'tiny' } },
  { id: 'small', title: 'Small population', text: '100 adults: drift takes over and the population melts down.', params: { K: 100 } },
  { id: 'clones', title: 'Clones', text: 'No sex: Muller’s ratchet turns until the population dies out.', params: { mode: 'asex' } },
  { id: 'nocross', title: 'Sex without crossing over', text: 'Whole chromosomes are passed on intact: the middle case.', params: { mode: 'nocross' } },
  { id: 'many', title: 'Too many mutations', text: 'U = 3 new damaging mutations per newborn, 10 young per mother: it dies out within about 110,000 years.', params: { U: 3 } },
  { id: 'fish', title: 'Many young', text: 'U = 3 again, but 30 young per mother: now it can pay.', params: { U: 3, F: 30 } },
  { id: 'synergy', title: 'Synergy', text: 'U = 3 with damage that hurts more and more as it adds up: it lives.', params: { U: 3, epistasis: 2 } },
  { id: 'soft', title: 'Competition for places', text: 'U = 3, but up to twice as many young survive as there are places and the healthier win them more often: it lives.', params: { U: 3, competition: 1 } },
  { id: 'males', title: 'Selection on males', text: 'U = 3, but healthier males father more young. A damaged male’s lost matings go to other males, so no young go unborn: it lives.', params: { U: 3, males: 1 } },
  { id: 'escapes', title: 'All three escapes', text: 'U = 5: competition, synergy and selection on males, each at strength 1. Any one alone dies out; all three together fill every place.', params: { U: 5, competition: 1, epistasis: 1, males: 1 } },
];

const DFE_OPTIONS = [
  ['human', 'Like real mutations (mean 1 %, mostly mild)'],
  ['strong', 'All severe (5 %)'],
  ['mild', 'All mild (0.5 %)'],
  ['weak', 'All weak (0.05 %)'],
  ['tiny', 'All tiny (0.002 %)'],
  ['custom', 'Custom spread…'],
];

const MODES = [
  ['sex', 'Sex with crossing over'],
  ['nocross', 'Sex without crossing over'],
  ['asex', 'Clones (no sex)'],
];

// Lab settings. Live ones change the running population; the others start
// a new one.
const SETTINGS = [
  { key: 'K', label: 'Places for adults (N)', min: 50, max: 10000, log: true, show: (v) => fmt.int(v), note: 'More places, weaker drift.' },
  { key: 'F', label: 'Young per mother', min: 2.2, max: 100, log: true, live: true, show: (v) => fmt.fixed(v, v < 10 ? 1 : 0), note: (v) => `At least ${fmt.pct(2 / v, 0)} must survive.` },
  { key: 'U', label: 'New damaging mutations per newborn (U)', min: 0, max: 5, step: 0.05, live: true, show: (v) => fmt.fixed(v, 2), note: (v) => `Haldane–Muller survival e^−U = ${fmt.pct(Math.exp(-v))}.` },
  { key: 'dfe', label: 'How much a broken gene costs', type: 'select', options: DFE_OPTIONS },
  { key: 'shape', label: 'Spread of effects (gamma shape)', min: 0.05, max: 5, log: true, only: (p) => p.dfe === 'custom', show: (v) => fmt.fixed(v, 2), note: 'Small = a few severe, many tiny.' },
  { key: 'meanS', label: 'Mean effect', min: 1e-5, max: 0.5, log: true, only: (p) => p.dfe === 'custom', show: (v) => fmt.effect(v) },
  { key: 'h', label: 'Dominance (h)', min: 0, max: 1, step: 0.05, live: true, show: (v) => fmt.fixed(v, 2), note: 'Cost of one broken copy, as a share of two.' },
  { key: 'repair', label: 'Repairs, as a share of damage', min: 0, max: 1, step: 0.05, live: true, show: (v) => fmt.fixed(v, 2) },
  { key: 'mode', label: 'Reproduction', type: 'select', options: MODES, live: true },
  { key: 'crossovers', label: 'Crossovers per chromosome', min: 0, max: 4, step: 0.1, live: true, show: (v) => fmt.fixed(v, 1) },
  { key: 'epistasis', label: 'Synergy (damage hurts more and more)', min: 0, max: 10, step: 0.1, live: true, show: (v) => (v > 0 ? fmt.fixed(v, 1) : 'off'), note: 'Above 0: each broken copy costs more than the one before.' },
  { key: 'competition', label: 'Competition for places', min: 0, max: 10, step: 0.1, live: true, show: (v) => (v > 0 ? fmt.fixed(v, 1) : 'off'), note: 'Above 0: up to twice as many young survive as there are places, and the healthier win them more often.' },
  { key: 'males', label: 'Selection on males', min: 0, max: 10, step: 0.1, live: true, show: (v) => (v > 0 ? fmt.fixed(v, 1) : 'off'), note: (v) => (v > 0 ? `A male whose damage cuts his survival by 10 % wins ${fmt.pct(1 - 0.9 ** v, 0)} fewer matings.` : 'Off: every young’s father is a male drawn at random.') },
  { key: 'genes', label: 'Genes per genome', type: 'select', options: GENE_CHOICES.map((g) => [g, fmt.int(g)]) },
  { key: 'years', label: 'Years per generation', min: 1, max: 40, step: 1, live: true, show: (v) => fmt.int(v) },
];

// ---------------------------------------------------------------- state

const S = {
  seed: store.get('seed') || DEFAULT_SEED,
  params: null,
  lab: null, // settings in the Lab, maybe not applied yet
  L: 0,
  C: 0,
  sFam: [],
  classes: [],
  theory: null,
  last: null,
  running: false,
  extinct: false,
  speed: 3,
  kernel: '',
  show: null, // a "Show me" in progress
  showDone: null, // the chapter whose "Show me" finished
  chapter: 0,
  answered: {},
  validation: BUILT,
  checking: null,
};

const charts = new Charts($('charts'));
const map = new GenomeMap($('map'));
let colors = {};
let dirty = true;

function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  colors = {
    plot: v('--plot'),
    plotFade: v('--plot-fade'),
    line: v('--line'),
    ink: v('--ink'),
    ink2: v('--ink-2'),
    ink3: v('--ink-3'),
    rust: v('--rust'),
    teal: v('--teal'),
    amber: v('--amber'),
    sky: v('--sky'),
    bad: v('--bad'),
    ghost: v('--ghost'),
    focus: v('--focus'),
    c0: v('--c0'),
    c1: v('--c1'),
    c2: v('--c2'),
    c3: v('--c3'),
    cell0: v('--cell0'),
    cell1: v('--cell1'),
    cellFixed: v('--cell-fixed'),
  };
}

// ---------------------------------------------------------------- the simulation

const host = createHost(onMessage);

function start(params, seed = S.seed, { keepGhost = false } = {}) {
  S.seed = seed;
  if (!keepGhost) charts.ghost = null;
  charts.points = [];
  charts.theory = [];
  S.last = null;
  S.extinct = false;
  host.send({ type: 'init', seed, params });
}

function theoryValues(t) {
  return {
    haldane: t.haldane,
    needed: t.needed,
    forecast: t.forecast.valid ? t.forecast.survival : null,
    forecastCopies: t.forecast.valid ? t.forecast.copies : null,
    forecastFixed: t.forecast.valid ? t.forecast.fixedBroken : null,
  };
}

function onMessage(m) {
  switch (m.type) {
    case 'ready':
      S.params = m.params;
      S.lab = { ...m.params };
      S.L = m.L;
      S.C = m.C;
      S.sFam = m.sFam;
      S.classes = m.classes;
      S.classGenes = m.classGenes;
      S.theory = m.theory;
      S.kernel = m.kernel;
      charts.K = m.params.K;
      charts.years = m.params.years;
      charts.theory = [{ gen: 0, values: theoryValues(m.theory) }];
      map.setGenome({ L: m.L, C: m.C, sFam: m.sFam, classes: m.classes });
      map.selected = -1;
      layoutMap();
      renderLab();
      renderLegend();
      dirty = true;
      break;
    case 'tick':
      if (m.reset) charts.points = [];
      for (const q of m.points) charts.points.push(q);
      S.last = m.last;
      S.running = m.running;
      S.extinct = m.last.extinct;
      if (m.counts) map.setCounts(m.counts, m.N);
      dirty = true;
      break;
    case 'params':
      S.params = m.params;
      S.lab = { ...m.params, ...pendingRestart() };
      S.theory = m.theory;
      charts.years = m.params.years;
      charts.theory.push({ gen: S.last ? S.last.gen : 0, values: theoryValues(m.theory) });
      renderLab();
      dirty = true;
      break;
    case 'paused':
      S.running = false;
      S.extinct = m.extinct;
      setPlay();
      if (S.show) advanceShow(m);
      dirty = true;
      break;
    case 'error':
      $('error').hidden = false;
      $('error').textContent = `Something went wrong: ${m.message}`;
      break;
    default:
      break;
  }
}

function play() {
  if (S.extinct) return;
  S.running = true;
  host.send({ type: 'play', speed: S.speed });
  setPlay();
}

function pause() {
  S.show = null;
  S.running = false;
  host.send({ type: 'pause' });
  setPlay();
}

function setPlay() {
  const b = $('play');
  b.innerHTML = S.running ? `${ICONS.pause}<span>Pause</span>` : `${ICONS.play}<span>Play</span>`;
  b.setAttribute('aria-label', S.running ? 'Pause' : 'Play');
  b.disabled = S.extinct && !S.running;
}

// ---------------------------------------------------------------- readouts, narrator, clock

const READOUT_KEYS = ['adults', 'survival', 'copies', 'fixed', 'clean', 'fitness'];

function state() {
  return { params: S.params, last: S.last, theory: S.theory, L: S.L, C: S.C, classes: S.classes, sFam: S.sFam };
}

function renderReadouts() {
  const box = $('readouts');
  if (!box.children.length) {
    box.innerHTML = READOUT_KEYS.map(
      (k) => `<button type="button" class="readout" data-readout="${k}"><span class="r-label">${READOUTS[k].label}</span><span class="r-value"></span><span class="r-unit"></span></button>`,
    ).join('');
  }
  if (!S.last) return;
  const st = state();
  for (const el of box.children) {
    const r = READOUTS[el.dataset.readout];
    el.querySelector('.r-value').textContent = r.value(st);
    el.querySelector('.r-unit').innerHTML = linkify(r.unit(st));
  }
}

function renderClock() {
  if (!S.last) return;
  $('clock-years').textContent = fmt.years(S.last.gen * S.params.years);
  $('clock-gen').textContent = `generation ${fmt.int(S.last.gen)}${S.extinct ? ' · extinct' : ''}`;
}

// ---------------------------------------------------------------- the map

function layoutMap() {
  if (!map.L) return;
  map.resize();
  dirty = true;
}

function renderLegend() {
  $('map-legend').innerHTML = `
    <span class="key"><i style="background:var(--cell0)"></i>intact in every copy</span>
    <span class="key"><i class="ramp"></i>share of copies broken</span>
    <span class="key"><i style="background:var(--cell-fixed)"></i>broken in every copy</span>
    <span class="hint">${map.view === 'effect' ? 'Most harmful genes top left, least harmful bottom right.' : 'Each block is one chromosome, read row by row.'} Tap a square.</span>`;
}

// ---------------------------------------------------------------- drawing

function frame() {
  if (dirty && S.params) {
    dirty = false;
    renderReadouts();
    renderClock();
    if (S.last) $('narrator').innerHTML = narrate(state());
    map.draw(colors);
    charts.draw(colors);
    renderCaption();
  }
  requestAnimationFrame(frame);
}

function renderCaption() {
  const el = $('chart-caption');
  if (charts.cursor === null) {
    el.innerHTML = 'Dashed: e<sup>−U</sup>, the price of mutations selection can see. Dotted teal: Wright’s long-run forecast for this genome. Red: the share of young needed to replace the adults. Tap a chart to read the values.';
    return;
  }
  const q = charts.pointAt(charts.cursor);
  if (!q) return;
  el.innerHTML = `<b>${fmt.years(q.gen * S.params.years)}</b> (generation ${fmt.int(q.gen)}): ${fmt.pct(q.survival)} of young survived · ${fmt.count(q.meanN)} broken copies per genome (fewest ${fmt.int(q.minN)}) · ${fmt.int(q.brokenAll)} genes broken in all · ${fmt.int(q.N)} adults`;
}

// ---------------------------------------------------------------- the sheet

function openSheet(html) {
  $('sheet-body').innerHTML = html;
  $('sheet').hidden = false;
  $('sheet-backdrop').hidden = false;
  $('sheet-close').focus();
}

function closeSheet() {
  $('sheet').hidden = true;
  $('sheet-backdrop').hidden = true;
  if (map.selected >= 0) {
    map.selected = -1;
    dirty = true;
  }
}

function openTerm(k) {
  const g = GLOSSARY[k];
  if (!g) return;
  openSheet(`<h2>${fmt.escape(g[0])}</h2><p>${linkify(g[1])}</p>`);
}

function openReadout(k) {
  if (!S.last) return;
  const r = READOUTS[k];
  const st = state();
  openSheet(`<h2>${r.title}</h2><p class="sheet-value">${r.value(st)} <span class="r-unit">${linkify(r.unit(st))}</span></p>${r
    .body(st)
    .filter(Boolean)
    .map((p) => `<p>${linkify(p)}</p>`)
    .join('')}`);
}

function openGene(g) {
  const card = geneCard(g, state(), map.freq[g]);
  map.selected = g;
  dirty = true;
  openSheet(`<h2>${card.title}</h2>${card.lines.map((l) => `<p>${linkify(l)}</p>`).join('')}`);
}

// ---------------------------------------------------------------- tabs and layout

const wide = window.matchMedia('(min-width: 1040px)');
let tab = store.get('tab') || 'learn';

function setTab(t) {
  if (wide.matches && t === 'watch') t = 'learn';
  tab = t;
  store.set('tab', t);
  for (const b of $('tabs').querySelectorAll('[role=tab]')) {
    const on = b.dataset.tab === t;
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
  }
  for (const p of document.querySelectorAll('.panel')) p.classList.toggle('active', p.dataset.panel === t);
  if (t === 'watch') requestAnimationFrame(sizeCharts);
}

function placeCharts() {
  const box = $('charts-box');
  const home = wide.matches ? $('charts-home') : $('panel-watch');
  if (box.parentElement !== home) home.appendChild(box);
  if (wide.matches && tab === 'watch') setTab('learn');
  sizeCharts();
}

function sizeCharts() {
  charts.resize();
  dirty = true;
}

function setBarHeight() {
  document.documentElement.style.setProperty('--bar-h', `${$('bar').getBoundingClientRect().height}px`);
}

// ---------------------------------------------------------------- Learn

function renderLearn() {
  const ch = CHAPTERS[S.chapter];
  const n = CHAPTERS.length;
  const ans = S.answered[ch.id];
  const pr = ch.predict;
  const dots = CHAPTERS.map(
    (c, i) => `<button type="button" class="dot${i === S.chapter ? ' on' : ''}${S.answered[c.id] !== undefined || i < S.chapter ? ' done' : ''}" data-chapter="${i}" aria-label="Chapter ${i + 1}: ${fmt.escape(c.title)}"></button>`,
  ).join('');
  let predict = '';
  if (pr) {
    const opts = pr.options
      .map((o, i) => {
        let cls = 'option';
        if (ans !== undefined) cls += o.right ? ' right' : i === ans ? ' wrong' : ' dim';
        return `<button type="button" class="${cls}" data-option="${i}"${ans !== undefined ? ' aria-disabled="true"' : ''}>${linkify(o.text)}</button>`;
      })
      .join('');
    predict = `<div class="predict"><p class="kicker">Predict first</p><p class="predict-q">${linkify(pr.q)}</p><div class="options">${opts}</div>${
      ans !== undefined ? `<p class="predict-a">${linkify(pr.explain)}</p>` : ''
    }</div>`;
  }
  const running = S.show && S.show.chapter === S.chapter;
  const done = S.showDone === S.chapter;
  const show = ch.show
    ? `<div class="show"><button type="button" class="btn primary" id="show-me" ${running ? 'disabled' : ''}>${running ? 'Running…' : done ? 'Show me again' : 'Show me'}</button> <span class="hint">${showHint(ch)}</span>${
        done || !ch.show ? `<p class="look">${linkify(ch.look)}</p>` : ''
      }</div>`
    : ch.look
      ? `<p class="look">${linkify(ch.look)}</p>`
      : '';
  $('panel-learn').innerHTML = `
    <div class="chapter-nav"><p class="kicker">Chapter ${S.chapter + 1} of ${n}</p><div class="dots">${dots}</div></div>
    <article class="chapter">
      <h2>${fmt.escape(ch.title)}</h2>
      ${ch.body.map((p) => `<p>${linkify(p)}</p>`).join('')}
      ${predict}
      ${show}
    </article>
    <div class="pager">
      <button type="button" class="btn ghost" id="prev-ch" ${S.chapter === 0 ? 'disabled' : ''}>← Back</button>
      <button type="button" class="btn" id="next-ch" ${S.chapter === n - 1 ? 'disabled' : ''}>Next →</button>
    </div>
    <details class="glossary"><summary>Glossary</summary><dl>${Object.entries(GLOSSARY)
      .map(([k, [t, d]]) => `<dt id="g-${k.replace(/\s/g, '-')}">${fmt.escape(t)}</dt><dd>${linkify(d)}</dd>`)
      .join('')}</dl></details>`;
}

function showHint(ch) {
  const gens = ch.show.steps.reduce((a, s) => a + s.gen, 0);
  const yrs = ch.show.steps.map((s) => fmt.years(s.gen * DEFAULTS.years)).join(', then ');
  const secs = Math.round((gens * 3.5) / 1000);
  return `Runs ${yrs}${secs > 20 ? `, about ${secs < 90 ? `${secs} seconds` : `${Math.round(secs / 60)} minutes`}` : ''}.`;
}

function showMe() {
  const ch = CHAPTERS[S.chapter];
  if (!ch.show) return;
  S.show = { chapter: S.chapter, i: 0 };
  S.showDone = null;
  charts.ghost = null;
  if (ch.show.map) setMapView(ch.show.map);
  runShowStep();
  renderLearn();
  if (!wide.matches) {
    setTab('watch');
    $('back-to-lesson').hidden = false;
  }
  $('stage').scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'start' });
}

function runShowStep() {
  const ch = CHAPTERS[S.show.chapter];
  const st = ch.show.steps[S.show.i];
  start({ ...st.params }, DEFAULT_SEED, { keepGhost: S.show.i > 0 });
  S.running = true;
  host.send({ type: 'runTo', gen: st.gen, speed: SPEEDS.length - 1 });
  setPlay();
}

function advanceShow(m) {
  const ch = CHAPTERS[S.show.chapter];
  const st = ch.show.steps[S.show.i];
  if (m.gen < st.gen && !m.extinct) return; // the pause right after starting
  if (st.ghost) charts.ghost = { label: st.ghost, points: charts.points.slice() };
  S.show.i++;
  if (S.show.i < ch.show.steps.length) {
    runShowStep();
    return;
  }
  S.showDone = S.show.chapter;
  S.show = null;
  renderLearn();
  if (!wide.matches) {
    $('back-to-lesson').hidden = false;
    showLessonNote(ch);
  }
}

function showLessonNote(ch) {
  let el = $('lesson-note');
  if (!el) {
    el = document.createElement('p');
    el.id = 'lesson-note';
    el.className = 'look';
    $('back-to-lesson').after(el);
  }
  el.innerHTML = `<b>${fmt.escape(ch.title)}.</b> ${linkify(ch.look)}`;
}

// ---------------------------------------------------------------- Lab

function pendingRestart() {
  // restart-only settings changed in the Lab but not applied yet
  const out = {};
  if (!S.lab || !S.params) return out;
  for (const s of SETTINGS) if (!s.live && S.lab[s.key] !== S.params[s.key]) out[s.key] = S.lab[s.key];
  return out;
}

function sliderPos(s, v) {
  if (s.log) return (Math.log(v) - Math.log(s.min)) / (Math.log(s.max) - Math.log(s.min));
  return (v - s.min) / (s.max - s.min);
}

function sliderValue(s, t) {
  let v = s.log ? Math.exp(Math.log(s.min) + t * (Math.log(s.max) - Math.log(s.min))) : s.min + t * (s.max - s.min);
  if (s.step) v = Math.round(v / s.step) * s.step;
  if (s.key === 'K') v = Math.round(v / (v < 500 ? 10 : v < 2000 ? 50 : 100)) * (v < 500 ? 10 : v < 2000 ? 50 : 100);
  else if (s.log && s.key === 'F') v = Math.round(v * (v < 10 ? 10 : 1)) / (v < 10 ? 10 : 1);
  else if (s.log) v = Number(v.toPrecision(2));
  return Math.min(s.max, Math.max(s.min, v));
}

function settingRow(s) {
  const p = S.lab;
  const v = p[s.key];
  const tag = s.live ? '<span class="live">changes now</span>' : '<span class="restart">new start</span>';
  const note = typeof s.note === 'function' ? s.note(v) : s.note ?? '';
  if (s.type === 'select') {
    return `<label class="slider select-row"><span>${fmt.escape(s.label)} ${tag}</span>
      <select data-setting="${s.key}">${s.options.map(([k, t]) => `<option value="${k}"${String(k) === String(v) ? ' selected' : ''}>${fmt.escape(t)}</option>`).join('')}</select></label>`;
  }
  return `<label class="slider"><span>${fmt.escape(s.label)} ${tag}</span><output>${s.show(v)}</output>
    <input type="range" min="0" max="1000" value="${Math.round(sliderPos(s, v) * 1000)}" data-setting="${s.key}">
    ${note ? `<span class="s-note">${linkify(note)}</span>` : ''}</label>`;
}

function renderLab() {
  if (!S.lab) return;
  const pend = Object.keys(pendingRestart()).length > 0;
  const current = SCENARIOS.find((sc) => sameSettings(sc.params));
  $('panel-lab').innerHTML = `
    <h2>Lab</h2>
    <p class="lede">Pick a scenario, or change the settings. Settings marked “changes now” act on the running population, so you can watch it respond; the others start a new population.</p>
    <h3>Scenarios</h3>
    <div class="scenarios" role="radiogroup" aria-label="Scenarios">${SCENARIOS.map(
      (sc) => `<button type="button" class="scenario" role="radio" aria-checked="${current === sc}" data-scenario="${sc.id}"><b>${fmt.escape(sc.title)}</b><span>${linkify(sc.text)}</span></button>`,
    ).join('')}</div>
    <h3>Settings</h3>
    <div class="sliders">${SETTINGS.filter((s) => !s.only || s.only(S.lab))
      .map(settingRow)
      .join('')}</div>
    <div class="lab-actions">
      <button type="button" class="btn${pend ? ' primary' : ''}" id="lab-restart">${pend ? 'Start with these settings' : 'Start again'}</button>
      <button type="button" class="btn ghost" id="lab-defaults">Reset to defaults</button>
    </div>
    <h3>Seed</h3>
    <p class="hint">Every random draw comes from this seed: the same seed and settings give the same run.</p>
    <div class="seed-row">
      <label class="seed-field">Seed <input id="seed" value="${fmt.escape(S.seed)}" spellcheck="false" autocomplete="off"></label>
      <button type="button" class="btn small" id="seed-go">Use</button>
      <button type="button" class="btn small ghost" id="seed-new">New seed</button>
    </div>
    <p class="hint engine-note">Running ${S.kernel === 'wasm' ? 'on WebAssembly' : 'in JavaScript'}${host.mode === 'worker' ? ' in a background worker' : ' on the page'}.</p>`;
}

function sameSettings(params) {
  const want = { ...DEFAULTS, ...params };
  return ['K', 'F', 'U', 'dfe', 'h', 'repair', 'mode', 'crossovers', 'epistasis', 'competition', 'males', 'genes'].every((k) => String(want[k]) === String(S.params[k]));
}

function onSetting(el, final) {
  const key = el.dataset.setting;
  const s = SETTINGS.find((x) => x.key === key);
  let v;
  if (s.type === 'select') v = key === 'genes' ? Number(el.value) : el.value;
  else v = sliderValue(s, Number(el.value) / 1000);
  S.lab[key] = v;
  const row = el.closest('.slider');
  if (s.type !== 'select') {
    row.querySelector('output').textContent = s.show(v);
    const note = row.querySelector('.s-note');
    if (note && typeof s.note === 'function') note.innerHTML = linkify(s.note(v));
  }
  if (!final) return;
  if (s.live) host.send({ type: 'set', patch: { [key]: v } });
  else renderLab();
}

function newSeed() {
  const words = ['amber', 'basalt', 'cedar', 'delta', 'ember', 'fjord', 'glade', 'heron', 'iris', 'juniper', 'kestrel', 'lichen', 'marten', 'newt', 'otter', 'pine', 'quartz', 'reed', 'sable', 'tern', 'umber', 'vole', 'willow', 'yarrow'];
  const r = () => words[Math.floor(Math.random() * words.length)];
  return `${r()}-${r()}-${Math.floor(Math.random() * 90 + 10)}`;
}

// ---------------------------------------------------------------- Validation

function renderChecks() {
  const v = S.validation;
  const running = S.checking;
  const total = checkCost(CHECKS.map((c) => c.id));
  const items = CHECKS.map((c) => {
    const r = v?.checks.find((x) => x.id === c.id);
    if (!r) return '';
    const busy = running && running.ids.includes(c.id);
    return `<li class="check ${r.pass ? 'pass' : 'miss'}">
      <div class="check-head"><span class="badge">${r.pass ? 'match' : 'miss'}</span><span>${linkify(r.title)}</span></div>
      <dl>
        <dt>Theory</dt><dd>${linkify(String(r.predicted))}</dd>
        <dt>Simulation</dt><dd>${linkify(String(r.simulated))}</dd>
        ${r.detail ? `<dt>Detail</dt><dd>${linkify(r.detail)}</dd>` : ''}
        <dt>Match if</dt><dd>${fmt.escape(r.tolerance)}</dd>
        <dt>Run</dt><dd>${r.runs.map(fmt.escape).join('; ')}</dd>
      </dl>
      <p class="why">${linkify(r.why)}</p>
      ${r.source ? `<p class="source">${fmt.escape(r.source)}</p>` : ''}
      <button type="button" class="btn small" data-recheck="${c.id}" ${running ? 'disabled' : ''}>${busy ? 'Running…' : `Run again here (about ${fmtSecs(checkCost(c.id))})`}</button>
    </li>`;
  }).join('');
  $('panel-check').innerHTML = `
    <h2>Does it match the theory?</h2>
    <p class="lede">Each check runs the real simulation, seeded so it is the same everywhere, and sets the result beside a prediction from population genetics. These results were computed when the page was built; any of them can be run again here.</p>
    ${v ? `<p class="score"><b>${v.passed}</b> of ${v.total} checks match</p>` : '<p class="score">No results yet.</p>'}
    <div class="check-run">
      <button type="button" class="btn" id="recheck-all" ${running ? 'disabled' : ''}>Run all again (about ${fmtSecs(total)})</button>
      ${running ? '<button type="button" class="btn ghost small" id="recheck-stop">Stop</button>' : ''}
      <span class="hint" id="check-status">${running ? 'Running…' : v && v.fresh ? 'Results from this page, just now.' : 'Results from the build.'}</span>
      <div class="progress" ${running ? '' : 'hidden'}><span id="check-bar"></span></div>
    </div>
    <ul class="checks">${items}</ul>`;
}

function fmtSecs(s) {
  if (s < 90) return `${Math.max(5, Math.round(s / 5) * 5)} seconds`;
  return `${Math.round(s / 60)} minutes`;
}

function recheck(ids) {
  if (S.checking) return;
  const job = host.validate(ids, (p) => {
    const bar = $('check-bar');
    if (bar) bar.style.width = `${Math.round(100 * (p.overall ?? 0))}%`;
  });
  S.checking = { ids: ids ?? CHECKS.map((c) => c.id), job };
  renderChecks();
  job.promise
    .then((res) => {
      const old = S.validation?.checks ?? [];
      const merged = old.map((c) => res.checks.find((x) => x.id === c.id) ?? c);
      for (const c of res.checks) if (!merged.find((x) => x.id === c.id)) merged.push(c);
      S.validation = { checks: merged, passed: merged.filter((c) => c.pass).length, total: merged.length, fresh: true };
    })
    .catch((err) => {
      $('error').hidden = false;
      $('error').textContent = `The check stopped: ${err.message}`;
    })
    .finally(() => {
      S.checking = null;
      renderChecks();
    });
}

// ---------------------------------------------------------------- events

function wire() {
  $('play').addEventListener('click', () => (S.running ? pause() : play()));
  $('step').innerHTML = ICONS.step;
  $('step').addEventListener('click', () => {
    S.show = null;
    host.send({ type: 'step', n: 1 });
  });
  $('restart').innerHTML = ICONS.restart;
  $('restart').addEventListener('click', () => {
    S.show = null;
    start({ ...S.params }, S.seed);
  });
  const sp = $('speed');
  sp.innerHTML = SPEED_LABELS.map((l, i) => `<option value="${i}"${i === S.speed ? ' selected' : ''}>${l}</option>`).join('');
  sp.addEventListener('change', () => {
    S.speed = Number(sp.value);
    host.send({ type: 'speed', speed: S.speed });
  });
  const jp = $('jump');
  jp.innerHTML = `<option value="">Run to…</option>${JUMPS.map((y) => `<option value="${y}">${fmt.years(y)}</option>`).join('')}`;
  jp.addEventListener('change', () => {
    const y = Number(jp.value);
    jp.value = '';
    if (!y || !S.params) return;
    S.show = null;
    const gen = Math.ceil(y / S.params.years);
    S.running = true;
    host.send({ type: 'runTo', gen, speed: SPEEDS.length - 1 });
    setPlay();
  });

  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[role=tab]');
    if (b) setTab(b.dataset.tab);
  });
  $('tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const tabs = [...$('tabs').querySelectorAll('[role=tab]')].filter((b) => b.offsetParent !== null);
    const i = tabs.findIndex((b) => b.dataset.tab === tab);
    const j = (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    setTab(tabs[j].dataset.tab);
    tabs[j].focus();
  });

  $('readouts').addEventListener('click', (e) => {
    const b = e.target.closest('[data-readout]');
    if (b) openReadout(b.dataset.readout);
  });
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-term]');
    if (t) openTerm(t.dataset.term);
  });

  $('map-views').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b) setMapView(b.dataset.view);
  });
  $('map').addEventListener('click', (e) => {
    const r = $('map').getBoundingClientRect();
    const g = map.geneAt(e.clientX - r.left, e.clientY - r.top);
    if (g >= 0 && S.last) openGene(g);
  });

  const cv = $('charts');
  const toCursor = (e) => {
    const r = cv.getBoundingClientRect();
    charts.cursor = charts.genAt(e.clientX - r.left);
    dirty = true;
  };
  cv.addEventListener('pointermove', toCursor);
  cv.addEventListener('pointerdown', toCursor);
  cv.addEventListener('pointerleave', () => {
    charts.cursor = null;
    dirty = true;
  });
  $('time-lin').addEventListener('click', () => setLog(false));
  $('time-log').addEventListener('click', () => setLog(true));
  $('ghost-btn').addEventListener('click', () => {
    if (charts.ghost) charts.ghost = null;
    else if (charts.points.length > 1) charts.ghost = { label: 'earlier run', points: charts.points.slice() };
    $('ghost-btn').textContent = charts.ghost ? 'Clear grey line' : 'Keep as grey line';
    dirty = true;
  });
  $('back-to-lesson').addEventListener('click', () => {
    setTab('learn');
    $('back-to-lesson').hidden = true;
    $('lesson-note')?.remove();
    $('side').scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'start' });
  });

  $('panel-learn').addEventListener('click', (e) => {
    const t = e.target;
    const dot = t.closest('[data-chapter]');
    if (dot) {
      S.chapter = Number(dot.dataset.chapter);
      renderLearn();
      return;
    }
    const opt = t.closest('[data-option]');
    if (opt) {
      const ch = CHAPTERS[S.chapter];
      if (S.answered[ch.id] === undefined) {
        S.answered[ch.id] = Number(opt.dataset.option);
        renderLearn();
      }
      return;
    }
    if (t.closest('#show-me')) showMe();
    else if (t.closest('#prev-ch')) {
      S.chapter = Math.max(0, S.chapter - 1);
      renderLearn();
      $('panel-learn').scrollIntoView({ block: 'start' });
    } else if (t.closest('#next-ch')) {
      S.chapter = Math.min(CHAPTERS.length - 1, S.chapter + 1);
      renderLearn();
      $('panel-learn').scrollIntoView({ block: 'start' });
    }
  });

  const lab = $('panel-lab');
  lab.addEventListener('input', (e) => {
    if (e.target.dataset.setting) onSetting(e.target, false);
  });
  lab.addEventListener('change', (e) => {
    if (e.target.dataset.setting) onSetting(e.target, true);
  });
  lab.addEventListener('click', (e) => {
    const t = e.target;
    const sc = t.closest('[data-scenario]');
    if (sc) {
      const scen = SCENARIOS.find((x) => x.id === sc.dataset.scenario);
      S.show = null;
      start({ ...scen.params }, S.seed);
      play();
      return;
    }
    if (t.closest('#lab-restart')) {
      S.show = null;
      start({ ...S.lab }, S.seed);
    } else if (t.closest('#lab-defaults')) {
      S.show = null;
      start({}, S.seed);
    } else if (t.closest('#seed-go')) {
      const v = $('seed').value.trim() || DEFAULT_SEED;
      store.set('seed', v);
      start({ ...S.params }, v);
    } else if (t.closest('#seed-new')) {
      const v = newSeed();
      store.set('seed', v);
      start({ ...S.params }, v);
    }
  });

  $('panel-check').addEventListener('click', (e) => {
    const t = e.target;
    const one = t.closest('[data-recheck]');
    if (one) recheck([one.dataset.recheck]);
    else if (t.closest('#recheck-all')) recheck(null);
    else if (t.closest('#recheck-stop') && S.checking) {
      S.checking.job.cancel();
      S.checking = null;
      renderChecks();
    }
  });

  $('sheet-close').addEventListener('click', closeSheet);
  $('sheet-backdrop').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('sheet').hidden) closeSheet();
    if (e.key === ' ' && e.target === document.body) {
      e.preventDefault();
      if (S.running) pause();
      else play();
    }
  });

  let rt = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      setBarHeight();
      placeCharts();
      layoutMap();
    }, 80);
  });
  wide.addEventListener?.('change', () => {
    placeCharts();
    setTab(tab);
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    readColors();
    dirty = true;
  });
}

function setMapView(v) {
  map.view = v;
  for (const b of $('map-views').querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', b.dataset.view === v ? 'true' : 'false');
  layoutMap();
  renderLegend();
}

function setLog(on) {
  charts.log = on;
  $('time-lin').setAttribute('aria-pressed', on ? 'false' : 'true');
  $('time-log').setAttribute('aria-pressed', on ? 'true' : 'false');
  dirty = true;
}

// ---------------------------------------------------------------- go

// When a new version of the page is published while it is open, carry on
// from the same seed, settings and generation: the same seed and settings
// always give the same run, so running there again restores it (settings
// changed during the run are not replayed).
function boot() {
  const hot = window.claude?.hot;
  let started = false;
  const go = (data) => {
    if (started) return;
    started = true;
    const d = data && typeof data === 'object' ? data : {};
    const seed = typeof d.seed === 'string' && d.seed ? d.seed : S.seed;
    const params = d.params && typeof d.params === 'object' ? d.params : {};
    if (Number.isInteger(d.chapter) && d.chapter >= 0 && d.chapter < CHAPTERS.length) {
      S.chapter = d.chapter;
      renderLearn();
    }
    start(params, seed);
    const gen = Number(d.gen);
    if (Number.isFinite(gen) && gen > 0) {
      S.running = true;
      host.send({ type: 'runTo', gen: Math.min(gen, 400000), speed: SPEEDS.length - 1 });
      setPlay();
    }
  };
  try {
    hot?.snapshot?.(() => ({ seed: S.seed, params: S.params ? { ...S.params } : {}, gen: S.last ? S.last.gen : 0, chapter: S.chapter }));
    if (hot?.ready) {
      hot.ready(go);
      setTimeout(() => go({}), 1500);
    } else go(hot?.data ?? {});
  } catch {
    go({});
  }
}

readColors();
wire();
setBarHeight();
placeCharts();
setTab(tab);
setPlay();
renderLearn();
renderChecks();
boot();
requestAnimationFrame(frame);
// for the browser tests
window.__ml = { state: S, host, charts, map };
if (document.fonts?.ready) document.fonts.ready.then(() => (dirty = true));
