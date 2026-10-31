// Everything the page says to the reader: the Learn chapters, the glossary,
// what each number means, the narrator line and the gene cards.
//
// In text, [word] links to the glossary entry `word` and [shown text|key] to
// entry `key`.

import * as fmt from './format.js';
import { wright } from '../sim/theory.js';

export const CHAPTERS = [
  {
    id: 'puzzle',
    title: 'The puzzle',
    body: [
      'Every newborn carries new [mutations|mutation]. A human child has about 70 DNA letters that neither parent had, and roughly one or two of them damage a gene. Most of that damage is slight: the gene works a little worse, and its owner is a fraction of a percent less likely to survive and have young.',
      'So here is the puzzle. A genome has thousands of genes, every generation adds new damage, and much of it is so slight that [selection] can barely notice it. Why doesn’t the damage pile up, generation after generation, until the species falls apart?',
      'This simulation lets you watch. 2,000 adults, each with 5,120 [genes|gene] on 20 chromosomes, two [copies|copy] of each. A copy is either intact or [broken]. Every newborn gets on average one new broken copy ([U] = 1). How much a broken gene costs ([s]) is drawn from the spread measured for real mutations: a few severe, most mild or tiny.',
      'Nobody picks the parents. Each mother has about 10 young by random fathers, and each young survives to adulthood or dies, with a chance set by its broken genes. That is all selection is here.',
    ],
    predict: {
      q: 'Run it for 100,000 years (4,000 generations). What happens to the number of broken copies in an average genome?',
      options: [
        { text: 'It climbs steadily, the same amount every generation' },
        { text: 'It climbs fast at first, then slows down', right: true },
        { text: 'It stays near zero: selection removes every new one' },
      ],
      explain:
        'Damage to severe genes reaches a balance within a few hundred generations: it is removed as fast as it arrives. Milder damage takes longer to balance. And genes that hardly matter keep collecting damage for hundreds of thousands of years (chapter 3).',
    },
    show: { steps: [{ params: {}, gen: 4000 }] },
    look: 'In the first chart the share of young that survive their genes falls from 100 % and levels off. In the genome map, the severe genes at the top stay pale while the tiny ones at the bottom darken. Tap any number or any square to see what it means.',
  },
  {
    id: 'price',
    title: 'Every mutation is paid for with one death',
    body: [
      'A broken copy lowers its carrier’s chance of surviving. It stays in the population, passed from parent to young, until one day a carrier dies young and takes it out. In the long run every broken copy is removed by a death.',
      'At [balance] damage must leave as fast as it arrives, and Haldane (1937) and Muller (1950) saw the surprising consequence: the share of young lost depends only on how many new damaging mutations arrive, not on how harmful each one is. With [U] new ones per newborn, a share e^−U of the young survive their genes: 37 % for U = 1. This is the [mutation load|load].',
      'A severe mutation kills quickly, so few young carry it. A mild one kills slowly, so it spreads to many before it goes. The two effects cancel exactly.',
    ],
    predict: {
      q: 'Make every gene ten times milder (s = 0.5 % instead of 5 %). How many young survive their genes now?',
      options: [
        { text: 'Many more: mild damage barely hurts' },
        { text: 'About the same: 37 %', right: true },
        { text: 'Fewer: mild damage slips past selection and piles up' },
      ],
      explain:
        'The same, about 37 %. Each mild mutation hurts ten times less but is carried ten times longer, by ten times as many genomes. The price per mutation is one death either way.',
    },
    show: {
      steps: [
        { params: { dfe: 'strong' }, gen: 3000, ghost: 'every gene severe (5 %)' },
        { params: { dfe: 'mild' }, gen: 3000 },
      ],
    },
    look: 'The grey line is the run with severe genes, the red one with mild genes: both settle on the dashed e^−U line. Now look at broken copies per genome: about 80 with severe genes (grey), nearly 700 with mild ones. Milder damage is carried by more genomes for longer, at the same price.',
  },
  {
    id: 'drift',
    title: 'Too weak to be seen: drift',
    body: [
      'Selection is not the only thing that changes how common a broken copy is. Which young survive is also luck, so every copy drifts up and down by chance from one generation to the next. This is [genetic drift|drift], and it is stronger in smaller populations.',
      'When a gene matters very little, drift wins. The rule of thumb: if 4·N·h·s is below about 1 (N adults, a broken copy costing h·s), selection cannot see the gene at all. Mutation keeps breaking it and nothing fixes it, so it slowly decays until it is broken in everyone: a [pseudogene]. This is the [drift barrier]. With 2,000 adults, genes whose loss costs less than about 0.05 % are below it.',
      'Real genomes are full of such wrecks. All humans carry a broken gene for making vitamin C, and hundreds of our smell-receptor genes are broken.',
    ],
    predict: {
      q: 'Half a million years on, what do the genes with tiny effects look like?',
      options: [
        { text: 'Still mostly intact' },
        { text: 'Mostly broken, many of them in every genome', right: true },
        { text: 'Broken in half the population, intact in the other half' },
      ],
      explain:
        'Mostly broken. Mutation breaks a copy about once every 10,000 generations and repairs it ten times more rarely, so with nothing to stop it, 91 % of copies end up broken, many genes in every single genome. Severe genes stay almost clean the whole time.',
    },
    show: { steps: [{ params: {}, gen: 20000 }], map: 'effect' },
    look: 'In the genome map the bottom bands, slight and tiny genes, have turned dark: the darkest squares are broken in every genome. The severe band at the top is still pale. Tap a square in each band to see why.',
  },
  {
    id: 'bounded',
    title: 'Why the weak damage stops hurting',
    body: [
      'So damage does pile up, in genes that hardly matter. Why doesn’t that ruin the species?',
      'Because they hardly matter. Below the drift barrier a gene costs at most its own small s, even when broken in everyone, and the total of all those small costs is limited. Damage also runs out of room: once a gene is broken in every genome, new hits on it change nothing.',
      'The long-run price has two parts: about U from the genes selection can see (the e^−U of chapter 2), plus the summed cost of the weak genes drift has broken. Wright’s theory adds these up gene by gene; for this genome it forecasts that 44 % of young survive their genes, while 20 % is all the population needs (two survivors from each mother’s ten young).',
    ],
    predict: {
      q: 'After a million years an average adult carries about 4,600 broken copies. How fit is it, compared with a perfect genome?',
      options: [
        { text: 'Almost as fit: 99 %' },
        { text: 'About half as fit', right: true },
        { text: 'Hopelessly unfit: under 1 %' },
      ],
      explain:
        'About 45 %. A perfect genome would do much better, but nobody has one and nobody needs one: what counts is that enough young survive to replace the adults, and they do.',
    },
    show: { steps: [{ params: {}, gen: 40000 }] },
    look: 'The survival line approaches the teal dotted forecast, well above the red “needed” line. Broken copies per genome approach their forecast too. Tap “Fitness” above the map for the average adult’s fitness.',
  },
  {
    id: 'small',
    title: 'Small populations melt down',
    body: [
      'With fewer adults drift is stronger, and the drift barrier moves up: genes that a large population protects are left to rot. Their costs add up.',
      'Past a point the young cannot pay: fewer survive than are needed, the population shrinks, drift grows stronger still, and it spirals down. This is [mutational meltdown|meltdown] (Lynch and colleagues, 1995), a real worry for endangered species. For this genome Wright’s forecast puts the line between 500 and 1,000 adults.',
    ],
    predict: {
      q: 'Shrink the population to 100 adults. What happens?',
      options: [
        { text: 'Nothing much: it behaves like 2,000' },
        { text: 'More genes rot, but it lives on' },
        { text: 'It melts down and dies out', right: true },
      ],
      explain:
        'It dies out, in this model after about 60,000 years. With 100 adults genes costing up to about 1 % behave almost as if they did not matter, and one after another they break in everyone.',
    },
    show: { steps: [{ params: {}, gen: 2500, ghost: '2,000 adults' }, { params: { K: 100 }, gen: 4000 }] },
    look: 'Grey is the population with 2,000 adults. With 100, the genes broken in everyone climb fast, survival sinks to the red line, and the adults vanish. Try 500 and 1,000 adults in the Lab (slow: the meltdown at 500 takes hundreds of thousands of years).',
  },
  {
    id: 'sex',
    title: 'Sex rebuilds clean genomes',
    body: [
      'Clones pass on their whole genome. The genomes with the fewest broken copies are always a small group, and sooner or later, by bad luck, all of them die without young. That class is then gone for good: a clone cannot have a cleaner genome than its parent’s. [Muller’s ratchet|ratchet] has clicked, and it keeps clicking.',
      'With sex every young gets a fresh mix of its four grandparents’ chromosomes, cut and rejoined by [crossing over|recombination]. Two damaged parents can have a cleaner child, so the best class is rebuilt again and again.',
    ],
    predict: {
      q: 'Same genome, same mutation rate, but the population reproduces as clones. What happens?',
      options: [
        { text: 'The same as with sex' },
        { text: 'Damage piles up and the population dies out', right: true },
        { text: 'Clones do better: every adult has young, not just the females' },
      ],
      explain:
        'It dies out, in this model within about 50,000 years. The fewest broken copies in any genome climbs and never comes back down, and survival sinks with it.',
    },
    show: { steps: [{ params: {}, gen: 2000, ghost: 'with sex' }, { params: { mode: 'asex' }, gen: 2200 }] },
    look: 'Grey is the same genome with sex. In clones the survival line keeps falling instead of levelling off, and the yellow “fewest” line in the second chart climbs step after step: each step is a click of the ratchet. Try “Sex without crossing over” in the Lab for the middle case.',
  },
  {
    id: 'win',
    title: 'When mutations do win',
    body: [
      'The price is paid in young, so it must be affordable. With 10 young per mother, 2 must survive; e^−U falls below that once U is above about 1.6 for severe genes. For our mixed genome the limit is higher, about U = 2.5, because many hits land on genes that hardly matter.',
      'This is the [load paradox|paradox]. Human estimates of U run to two or more damaging mutations per birth, and our ancestors had few children. Several things help: damage that hurts more and more ([synergy]), so each death removes several mutations at once; young that compete for places ([soft selection|competition]), so damage decides who wins rather than how many survive; and the fact that many hits land on genes that matter little.',
    ],
    predict: {
      q: 'Four new damaging mutations per newborn (U = 4), still 10 young per mother. What happens?',
      options: [
        { text: 'It survives, with fewer adults' },
        { text: 'It dies out', right: true },
        { text: 'Selection gets stronger and keeps up' },
      ],
      explain:
        'It dies out within about 30,000 years: too few young survive their genes to replace the adults. In the Lab, the scenarios with U = 3 show three ways out: more young per mother, synergy, or competition for places.',
    },
    show: { steps: [{ params: { U: 4 }, gen: 1500 }] },
    look: 'Survival drops below the red line and the population collapses. The dashed e^−U line (1.8 %) is far below; the real survival stays above it only because many hits fall on genes that hardly matter.',
  },
  {
    id: 'answer',
    title: 'The answer',
    body: [
      'Why don’t harmful mutations take over, when there are thousands of genes and many matter very little?',
      '1. Every damaging mutation that selection can see is eventually removed by one death. At balance this costs a share 1 − e^−U of the young, however slight the damage is. Species pay it with spare young.',
      '2. Damage too slight for selection to see does pile up, but by definition it costs little, and it stops when those genes are broken in everyone. Genomes really are littered with such broken genes.',
      '3. Large populations keep the drift barrier low, so only genes that truly do not matter rot. Small populations lose more and can melt down.',
      '4. Sex rebuilds clean genomes; without it, Muller’s ratchet wins.',
      'Mutations do win when the price is more than the young can pay: too many new ones per birth, too few adults, or no sex.',
    ],
    look: 'Everything here is a model with simplifications (the README lists them). The Validation tab checks the simulation against the theory behind each claim.',
  },
];

// Glossary. Keys are lower case.
export const GLOSSARY = {
  gene: ['Gene', 'A stretch of DNA that does one job. Here each genome has 5,120 genes (real vertebrates have about 20,000), arranged along 20 chromosomes.'],
  copy: ['Copy', 'Each gene comes in two copies, one from each parent (diploid). A gene can be broken in one copy, in both, or in neither.'],
  broken: ['Broken copy', 'A copy that a mutation has damaged so it no longer works. Here a copy is either intact or broken; in reality damage comes in degrees.'],
  mutation: ['Mutation', 'A change in DNA copied wrongly. Most are harmless; the ones counted here damage a gene. A rare mutation can also repair a broken copy.'],
  u: ['U', 'New damaging mutations per newborn (both copies of the genome together), per generation. Estimates for humans run from about 1 to 3.'],
  s: ['s, the effect', 'How much a gene broken in both copies lowers survival: s = 1 % means 1 % fewer survive. Effects here follow a gamma distribution fitted to real mutations: mean 1 %, but half of all genes cost less than 0.1 %.'],
  h: ['h, dominance', 'How much of the cost one broken copy already brings: one broken copy costs h·s. Here h = 0.25, typical of measured mildly harmful mutations, which are partly recessive.'],
  fitness: ['Fitness', 'The chance of surviving to adulthood, relative to a genome with no broken copies. Costs multiply: each gene broken in one copy multiplies it by (1 − h·s), in both by (1 − s).'],
  selection: ['Selection', 'Here simply this: young with more damage die more often. Nobody chooses the parents; damage only shifts the odds.'],
  load: ['Mutation load', 'The share of young lost because of their broken genes, compared with perfect genomes. At balance it is 1 − e^−U for mutations selection can see.'],
  balance: ['Mutation–selection balance', 'The steady state where broken copies are removed by deaths as fast as mutation makes new ones.'],
  drift: ['Genetic drift', 'Chance changes in how common a copy is, because which young survive is partly luck. Over many generations drift can carry a copy to every genome or wipe it out.'],
  'drift barrier': ['Drift barrier', 'The effect below which selection cannot see a gene: roughly 4·N·h·s < 1. Genes below it decay as if they did not matter. Smaller populations have a higher barrier.'],
  fixation: ['Fixed', 'A copy type is fixed when every genome carries it: a gene broken in every copy of every adult is fixed broken. Only a rare repair can change it back.'],
  pseudogene: ['Pseudogene', 'A gene broken beyond use, in every member of a species, that still sits in the genome. Humans have about as many pseudogenes as working genes.'],
  recombination: ['Crossing over', 'When eggs and sperm are made, each pair of chromosomes swaps pieces. Here 1.5 crossovers per chromosome on average, about as in humans.'],
  ratchet: ['Muller’s ratchet', 'In populations without sex, the class of genomes with the fewest broken copies is lost by chance and cannot be rebuilt; each loss is a click of the ratchet.'],
  synergy: ['Synergy (epistasis)', 'Damage that hurts more and more as it adds up: log fitness = −D − synergy·D²/2. Then each death removes more broken copies than average, which lowers the price.'],
  competition: ['Soft selection', 'When more young survive than there are places, the healthier win places more often. Damage then decides who gets a place, not how many young survive.'],
  meltdown: ['Mutational meltdown', 'A small population collects damage by drift, makes too few surviving young, shrinks, drifts harder, and dies out.'],
  paradox: ['Load paradox', 'If humans really receive two or more damaging mutations per birth, e^−U says most conceptions should fail. How our ancestors coped is still debated.'],
  wright: ['Wright’s distribution', 'Sewall Wright’s formula (1937) for how common a broken copy is, on average, under mutation, repair, selection and drift. Summed over genes it forecasts the whole genome.'],
  n: ['N, population size', 'The number of adults, here the 2,000 places. Drift is strong when 4·N·h·s is small.'],
  generation: ['Generation', 'One round of birth, survival and reproduction. With 25 years per generation, a million years is 40,000 generations.'],
  repair: ['Repair', 'A rare mutation that turns a broken copy back to intact (in reality, a reversal or a compensating change). Here ten times rarer than damage.'],
};

const keyOf = (k) => k.toLowerCase();

// [word] and [text|key] become glossary buttons.
export function linkify(text) {
  return fmt
    .escape(text)
    .replace(/\[([^\]|]+)(?:\|([^\]]+))?\]/g, (m, shown, key) => {
      const k = keyOf(key ?? shown);
      if (!GLOSSARY[k]) return shown;
      return `<button type="button" class="term" data-term="${k}">${shown}</button>`;
    })
    .replace(/e\^−([A-Za-z0-9]+(?:\.[0-9]+)?)/g, 'e<sup>−$1</sup>');
}

// What each readout means, for the explanation sheet.
export const READOUTS = {
  adults: {
    label: 'Adults',
    value: (s) => fmt.int(s.last.N),
    unit: (s) => `of ${fmt.int(s.params.K)} places`,
    title: 'Adults',
    body: (s) => [
      `There are places for ${fmt.int(s.params.K)} adults. Each generation the young that survive their genes take the places, at random, and the adults die.`,
      `If fewer young survive than there are places, the population shrinks. Each mother has ${fmt.fixed(s.params.F, 0)} young on average, so at least ${fmt.pct(2 / s.params.F, 0)} of them must survive.`,
    ],
  },
  survival: {
    label: 'Young surviving',
    value: (s) => fmt.pct(s.last.survival),
    unit: (s) => `e^−U = ${fmt.pct(s.theory.haldane)}`,
    title: 'Young that survive their genes',
    body: (s) => [
      `This generation ${fmt.pct(s.last.survival)} of the young survived. The rest died because of their broken genes: each young survives with a chance set by its damage, and a random draw decides.`,
      `Haldane and Muller’s rule for mutations that selection can see: at balance e^−U = ${fmt.pct(s.theory.haldane)} survive, however mild each mutation is.${s.theory.forecast.valid ? ` Wright’s long-run forecast for this genome, counting the weak genes drift breaks: ${fmt.pct(s.theory.forecast.survival)}.` : ''}`,
      `Needed for the population to replace itself: ${fmt.pct(s.theory.needed, 0)}.`,
    ],
  },
  copies: {
    label: 'Broken copies',
    value: (s) => fmt.count(s.last.meanN),
    unit: (s) => `per genome · fewest ${fmt.int(s.last.minN)}`,
    title: 'Broken copies per genome',
    body: (s) => [
      `An average adult carries ${fmt.count(s.last.meanN)} broken gene copies out of ${fmt.int(2 * s.L)}; the cleanest carries ${fmt.int(s.last.minN)}.`,
      'Most of them sit in genes that matter very little. Severe genes are broken in only a few copies each, because their carriers die young.',
      s.theory.forecast.valid ? `Wright’s long-run forecast: ${fmt.int(s.theory.forecast.copies)}.` : '',
    ],
  },
  fixed: {
    label: 'Broken in all',
    value: (s) => fmt.int(s.last.brokenAll),
    unit: (s) => `of ${fmt.int(s.L)} genes`,
    title: 'Genes broken in every genome',
    body: (s) => [
      `${fmt.int(s.last.brokenAll)} genes are broken in both copies of every adult: fixed broken, like pseudogenes. By effect: ${s.classes.map((c, i) => `${c.label} ${fmt.int(s.last.fixedBy[i])}`).join(', ')}.`,
      'Almost all are genes too weak for selection to see. Mutation broke them and drift carried the broken copy to everyone.',
      `Over the whole run ${fmt.int(s.last.subsDamage)} genes have become broken in everyone and ${fmt.int(s.last.subsRepair)} have been repaired in everyone.`,
    ],
  },
  clean: {
    label: 'Clean in all',
    value: (s) => fmt.int(s.L - s.last.brokenAll - s.last.poly),
    unit: () => 'genes',
    title: 'Genes intact in every genome',
    body: (s) => [
      `${fmt.int(s.L - s.last.brokenAll - s.last.poly)} genes have no broken copy in any adult right now. ${fmt.int(s.last.poly)} genes are broken in some copies but not all.`,
      'A severe gene is usually broken in a handful of copies at most: each new hit is removed within a few generations.',
    ],
  },
  fitness: {
    label: 'Fitness',
    value: (s) => fmt.pct(Math.exp(-s.last.meanD)),
    unit: () => 'vs a perfect genome',
    title: 'Fitness of an average adult',
    body: (s) => [
      `Compared with a genome with no broken copies, an average adult’s young would survive ${fmt.pct(Math.exp(-s.last.meanD))} as often.`,
      'That sounds bad, but nobody has a perfect genome and nobody needs one: what matters is that enough young survive to replace the adults.',
    ],
  },
};

// One gene, for the card that opens when its square is tapped.
export function geneCard(g, s, freq) {
  const p = s.params;
  const G = s.L / s.C;
  const fam = g >> 5;
  const eff = s.sFam[fam];
  const hs = p.h * eff;
  const S = 4 * p.K * hs;
  let cls = s.classes.length - 1;
  for (let i = 0; i < s.classes.length; i++) if (eff >= s.classes[i].min) {
    cls = i;
    break;
  }
  const u = p.U / (2 * s.L);
  const wr = p.mode === 'sex' ? wright(p.K, u, u * p.repair, eff, p.h) : null;
  const verdict =
    S > 10
      ? 'Selection sees it clearly: broken copies are removed within a few hundred generations, so it stays almost clean.'
      : S > 1
        ? 'In between: selection holds it back, but drift sometimes carries broken copies far.'
        : 'Too weak for selection to see (4·N·h·s below 1): mutation breaks it, drift spreads the damage, and it decays like a pseudogene.';
  return {
    title: `Gene ${fmt.int(g + 1)}`,
    lines: [
      `Chromosome ${Math.floor(g / G) + 1}, position ${(g % G) + 1} of ${G}. Effect class: ${s.classes[cls].label}.`,
      `Broken in both copies it costs s = ${fmt.effect(eff)} of survival; in one copy h·s = ${fmt.effect(hs)}.`,
      `Now broken in ${fmt.pct(freq, freq > 0 && freq < 0.01 ? 2 : 1)} of all copies${freq >= 1 ? ', every single one' : ''}.`,
      `4·N·h·s = ${S >= 100 ? fmt.int(S) : fmt.fixed(S, S >= 1 ? 1 : 3)}. ${verdict}`,
      wr ? `Wright’s long-run average for a gene like this: ${fmt.pct(wr.q, wr.q < 0.01 ? 2 : 1)} of copies broken.` : '',
    ].filter(Boolean),
  };
}

// The narrator: what is happening now, in a sentence or three.
export function narrate(s) {
  const p = s.params;
  const L = s.last;
  const yrs = fmt.years(L.gen * p.years);
  if (L.extinct || L.N === 0) {
    let why = `Too few young survived their genes to replace the adults (at least ${fmt.pct(2 / p.F, 0)} were needed).`;
    if (p.mode === 'asex') why = 'Without sex, Muller’s ratchet kept turning: the cleanest genomes were lost one class after another until too few young survived.';
    else if (p.K <= 300) why = `With only ${fmt.int(p.K)} places, drift let damage take over one gene after another until too few young survived.`;
    else if (s.theory.haldane < 2 / p.F) why = `With U = ${fmt.fixed(p.U, 1)} new damaging mutations per newborn, too few young could survive their genes: fewer than the ${fmt.pct(2 / p.F, 0)} needed.`;
    return `<b>Extinct</b> after ${yrs}. ${why}`;
  }
  if (L.gen === 0) {
    return `Every genome starts perfect: not one broken copy. Press <b>Play</b>: each newborn will get about ${fmt.fixed(p.U, p.U < 1 ? 2 : 1)} new damaging mutation${p.U === 1 ? '' : 's'}, and the young with more damage will die more often.`;
  }
  const survival = fmt.pct(L.survival, 0);
  if (L.N < p.K) {
    return `<b>Shrinking:</b> only ${survival} of the young survive their genes, and ${fmt.pct(2 / p.F, 0)} are needed to fill the ${fmt.int(p.K)} places. ${fmt.int(L.N)} adults left.`;
  }
  if (p.mode === 'asex') {
    return `Clones: the cleanest genome now carries ${fmt.int(L.minN)} broken copies, and that number can only go up. Each step is a click of Muller’s ratchet. ${survival} of the young survive.`;
  }
  if (L.gen < 150) {
    return `Damage is building up: each newborn inherits its parents’ broken copies and adds new ones. Average ${fmt.count(L.meanN)} broken copies per genome; ${survival} of the young survive their genes.`;
  }
  if (L.brokenAll === 0) {
    return `Balance: about as many broken copies leave each generation, with the young that die, as mutation adds. ${survival} of the young survive their genes, close to Haldane and Muller’s e<sup>−U</sup> = ${fmt.pct(s.theory.haldane, 0)}.`;
  }
  if (L.gen < 20000) {
    const weak = L.fixedBy[2] + L.fixedBy[3];
    return `Genes too weak for selection to see are rotting: ${fmt.int(L.brokenAll)} are now broken in every genome, ${fmt.int(weak)} of them slight or tiny. They cost little: ${survival} of the young still survive their genes. ${yrs} so far.`;
  }
  const f = s.theory.forecast;
  return `${yrs} in: severe genes stay clean while weak ones rot. ${survival} of the young survive their genes${f.valid ? `; Wright’s forecast for the long run is ${fmt.pct(f.survival, 0)}` : ''}. ${fmt.int(L.brokenAll)} genes are broken in everyone.`;
}
