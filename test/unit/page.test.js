import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { CHAPTERS, GLOSSARY, READOUTS, linkify, narrate, geneCard } from '../../src/app/guide.js';
import { createSimServer } from '../../src/app/server.js';
import { CHECKS, EXPERIMENTS, checkCost } from '../../src/app/validation.js';
import { Engine, CLASSES } from '../../src/sim/engine.js';
import { loadSurvival, survivalNeeded } from '../../src/sim/theory.js';
import * as fmt from '../../src/app/format.js';

const termsIn = (t) => [...String(t).matchAll(/\[([^\]|]+)(?:\|([^\]]+))?\]/g)].map((m) => (m[2] ?? m[1]).toLowerCase());

test('every glossary link in the lessons has an entry', () => {
  for (const ch of CHAPTERS) {
    const texts = [...ch.body, ch.look ?? '', ch.predict?.q ?? '', ch.predict?.explain ?? '', ...(ch.predict?.options ?? []).map((o) => o.text)];
    for (const t of texts) for (const k of termsIn(t)) assert.ok(GLOSSARY[k], `chapter "${ch.id}" links to missing term "${k}"`);
  }
  for (const [, d] of Object.values(GLOSSARY)) for (const k of termsIn(d)) assert.ok(GLOSSARY[k], k);
});

test('every prediction has exactly one right answer and every show runs forward', () => {
  for (const ch of CHAPTERS) {
    if (ch.predict) assert.equal(ch.predict.options.filter((o) => o.right).length, 1, ch.id);
    for (const s of ch.show?.steps ?? []) assert.ok(s.gen > 0 && s.params && typeof s.params === 'object', ch.id);
    assert.ok(ch.look, ch.id);
  }
});

test('links become buttons and text is escaped', () => {
  const html = linkify('a <b> [drift] and [the barrier|drift barrier], e^−U.');
  assert.match(html, /a &lt;b&gt; /);
  assert.match(html, /data-term="drift">drift</);
  assert.match(html, /data-term="drift barrier">the barrier</);
  assert.match(html, /e<sup>−U<\/sup>\.$/);
});

test('numbers are written for people', () => {
  assert.equal(fmt.int(1234567), '1,234,567');
  assert.equal(fmt.pct(0.3679), '36.8 %');
  assert.equal(fmt.years(50000), '50,000 years');
  assert.equal(fmt.years(1e6), '1.00 million years');
  assert.equal(fmt.short(1500), '1.5k');
  assert.equal(fmt.effect(0.05), '5 %');
  assert.equal(fmt.effect(0.0005), '0.05 %');
  assert.equal(fmt.effect(2e-5), '0.002 %');
  assert.equal(fmt.count(76.84), '76.8');
  assert.equal(fmt.escape('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
});

test('every readout, the narrator and the gene cards work at every stage', () => {
  const engines = [
    new Engine({ seed: 'g', params: { K: 100 } }),
    (() => {
      const e = new Engine({ seed: 'g', params: { K: 100 } });
      e.run(400);
      return e;
    })(),
    (() => {
      const e = new Engine({ seed: 'g', params: { K: 100, mode: 'asex' } });
      e.run(50);
      return e;
    })(),
    (() => {
      const e = new Engine({ seed: 'g', params: { K: 60, dfe: 'strong', U: 5, F: 4 } });
      e.run(500);
      return e;
    })(),
  ];
  for (const e of engines) {
    const p = e.params;
    const st = {
      params: p,
      last: e.last,
      L: e.L,
      C: e.C,
      classes: CLASSES,
      sFam: Array.from(e.sFam),
      theory: { haldane: loadSurvival(p.U), needed: survivalNeeded(p.F), forecast: { valid: true, survival: 0.4, copies: 100, fixedBroken: 3 } },
    };
    assert.ok(narrate(st).length > 30);
    for (const r of Object.values(READOUTS)) {
      assert.ok(r.value(st));
      assert.ok(r.body(st).join(' ').length > 40);
    }
    const card = geneCard(7, st, 0.25);
    assert.ok(card.title && card.lines.length >= 4);
  }
  assert.match(narrate({ params: engines[3].params, last: engines[3].last, theory: { haldane: 0.0067, needed: 0.5, forecast: { valid: false } } }), /Extinct/);
});

test('the simulation server answers init, step, set and runTo', async () => {
  const got = [];
  const handle = createSimServer((m) => got.push(m));
  handle({ type: 'init', seed: 'genome', params: { K: 100 } });
  assert.equal(got[0].type, 'ready');
  assert.equal(got[0].sFam.length * 32, got[0].L);
  assert.equal(got[1].type, 'tick');
  assert.equal(got[1].counts.length, got[0].L);
  handle({ type: 'step', n: 3 });
  const tick = got.filter((m) => m.type === 'tick').at(-1);
  assert.equal(tick.points.length, 3, 'only the new points are sent');
  assert.equal(got.at(-1).type, 'paused');
  handle({ type: 'set', patch: { U: 2 } });
  const params = got.filter((m) => m.type === 'params').at(-1);
  assert.equal(params.params.U, 2);
  assert.ok(Math.abs(params.theory.haldane - Math.exp(-2)) < 1e-12);
  const before = got.filter((m) => m.type === 'paused').length;
  handle({ type: 'runTo', gen: 40, speed: 3 });
  await new Promise((resolve) => {
    const wait = () => (got.filter((m) => m.type === 'paused').length > before ? resolve() : setTimeout(wait, 20));
    wait();
  });
  assert.equal(got.filter((m) => m.type === 'paused').at(-1).gen, 40);
  handle({ type: 'nonsense' });
  assert.ok(!got.some((m) => m.type === 'error'));
});

test('the checks are well formed', () => {
  const ids = new Set(EXPERIMENTS.map((x) => x.id));
  for (const c of CHECKS) {
    assert.ok(c.title && c.why && c.tolerance, c.id);
    for (const u of c.uses) assert.ok(ids.has(u), `${c.id} uses ${u}`);
  }
  assert.ok(checkCost(CHECKS.map((c) => c.id)) > 60);
});

test('the built page holds everything it needs', { skip: !existsSync('dist/index.html') }, () => {
  const html = readFileSync('dist/index.html', 'utf8');
  assert.match(html, /<title>Mutation Load<\/title>/);
  assert.ok(!/<script[^>]+src=/i.test(html), 'no external scripts');
  const v = JSON.parse(readFileSync('dist/validation.json', 'utf8'));
  assert.equal(v.total, CHECKS.length, 'the built page carries every check');
  assert.equal(v.passed, v.total, 'every check matches');
});
