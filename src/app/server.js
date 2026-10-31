// The simulation side of the page. It owns an Engine and talks to the page
// only through messages, so the same code runs in a Web Worker or, where a
// worker cannot start, on the page itself in short slices.
//
// Page → sim:  init {seed, params} · play {speed} · pause · speed {speed}
//              step {n} · runTo {gen, speed} · set {patch}
// Sim → page:  ready {...} · tick {last, points, reset, counts, ...}
//              paused {gen, extinct} · error {message}

import { Engine, CLASSES, classOf } from '../sim/engine.js';
import { DEFAULTS, RANGES } from '../sim/params.js';
import { genomeForecast, loadSurvival, survivalNeeded } from '../sim/theory.js';

// Generations per second at each speed; the last runs flat out.
export const SPEEDS = [4, 40, 400, Infinity];

// Long-run forecast for the current settings, where the theory applies.
function forecastOf(engine) {
  const p = engine.params;
  const valid = p.mode === 'sex' && p.epistasis === 0 && p.competition === 0 && p.males === 0;
  const f = genomeForecast({ N: p.K, U: p.U, repair: p.repair, h: p.h, effects: Array.from(engine.sFam), classOf });
  return {
    valid,
    copies: f.copies,
    survival: f.survival,
    fixedBroken: f.fixedBroken,
    byClass: CLASSES.map((c, i) => {
      const b = f.byClass.get(i);
      return b ? { genes: b.genes, copies: b.copies, fixedBroken: b.fixedBroken, logSurvival: b.logSurvival } : null;
    }),
  };
}

function theoryOf(engine) {
  const p = engine.params;
  return { haldane: loadSurvival(p.U), needed: survivalNeeded(p.F), forecast: forecastOf(engine) };
}

export function createSimServer(post) {
  let engine = null;
  let timer = null;
  let running = false;
  let speed = 3;
  let target = null; // generation to stop at, for runTo
  let sent = 0; // history points already sent
  let stride = 1;
  let lastCounts = 0;

  const send = (withCounts) => {
    const h = engine.history;
    let reset = false;
    if (engine.stride !== stride) {
      // the history was thinned: send all of it again
      reset = true;
      stride = engine.stride;
      sent = 0;
    }
    const points = h.slice(sent);
    sent = h.length;
    const now = Date.now();
    let counts = null;
    if (withCounts || now - lastCounts > 300) {
      counts = engine.counts();
      lastCounts = Date.now();
    }
    post({
      type: 'tick',
      last: engine.last,
      points,
      reset,
      counts,
      N: engine.N,
      running,
      kernel: engine.kernel,
      changes: engine.changes,
    });
  };

  const stop = () => {
    running = false;
    target = null;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const loop = () => {
    timer = null;
    if (!running) return;
    const rate = SPEEDS[speed] ?? SPEEDS[1];
    const budget = 30; // ms of work per slice, so the page stays smooth
    const t0 = Date.now();
    const want = Number.isFinite(rate) ? Math.max(1, Math.round(rate / 25)) : Infinity;
    let n = 0;
    while (!engine.extinct && n < want) {
      if (target !== null && engine.gen >= target) break;
      engine.step();
      n++;
      if (Date.now() - t0 > budget) break;
    }
    const reached = target !== null && engine.gen >= target;
    if (engine.extinct || reached) {
      running = false;
      target = null;
    }
    send(!running);
    const wait = Number.isFinite(rate) ? Math.max(0, (1000 * Math.max(n, 1)) / rate - (Date.now() - t0)) : 0;
    if (running) timer = setTimeout(loop, wait);
    else post({ type: 'paused', gen: engine.gen, extinct: engine.extinct });
  };

  const start = () => {
    if (engine.extinct) return;
    running = true;
    if (!timer) timer = setTimeout(loop, 0);
  };

  const ready = () => {
    post({
      type: 'ready',
      seed: engine.seed,
      params: engine.params,
      defaults: DEFAULTS,
      ranges: RANGES,
      L: engine.L,
      W: engine.W,
      C: engine.C,
      WPC: engine.WPC,
      sFam: Array.from(engine.sFam),
      classes: CLASSES,
      classGenes: Array.from(engine.classGenes),
      theory: theoryOf(engine),
      kernel: engine.kernel,
    });
  };

  return function handle(msg) {
    try {
      switch (msg.type) {
        case 'init': {
          stop();
          engine = new Engine({ seed: msg.seed, params: msg.params ?? {} });
          sent = 0;
          stride = engine.stride;
          ready();
          send(true);
          post({ type: 'paused', gen: engine.gen, extinct: engine.extinct });
          break;
        }
        case 'play':
          if (!engine) break;
          if (typeof msg.speed === 'number') speed = msg.speed;
          target = null;
          start();
          break;
        case 'speed':
          speed = msg.speed;
          break;
        case 'pause':
          stop();
          if (engine) {
            send(true);
            post({ type: 'paused', gen: engine.gen, extinct: engine.extinct });
          }
          break;
        case 'runTo':
          if (!engine) break;
          if (typeof msg.speed === 'number') speed = msg.speed;
          if (engine.gen >= msg.gen || engine.extinct) {
            stop();
            send(true);
            post({ type: 'paused', gen: engine.gen, extinct: engine.extinct });
            break;
          }
          target = msg.gen;
          start();
          break;
        case 'step':
          if (!engine) break;
          stop();
          engine.run(msg.n ?? 1);
          send(true);
          post({ type: 'paused', gen: engine.gen, extinct: engine.extinct });
          break;
        case 'set':
          if (!engine) break;
          if (engine.setParams(msg.patch)) {
            post({ type: 'params', params: engine.params, theory: theoryOf(engine), changes: engine.changes });
            send(false);
          }
          break;
        default:
          break;
      }
    } catch (err) {
      stop();
      post({ type: 'error', message: String(err && err.stack ? err.stack : err) });
    }
  };
}
