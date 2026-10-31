# Why mutations don’t win

A browser simulation of **mutation load**: a population of 2,000 animals with 5,120 genes each gets about one new damaging mutation per newborn, generation after generation, for a million years (40,000 generations of 25 years). Many of the genes matter very little. Why doesn’t the damage pile up until the species falls apart?

**Play it:** https://claude.ai/artifact/YYjZGC4Wt1L4yjzNeoVr4B

The page is one self-contained file (`dist/index.html`). It shows the whole population’s genome as a map (every gene coloured by how many of its copies are broken), charts of survival, damage and genes lost over time, a narrator that explains what is happening, nine Learn chapters with a question to answer before each “Show me”, a Lab with fourteen scenarios and live settings, and a Validation tab that sets the simulation against population-genetics theory.

## What it shows

1. **Every mutation selection can see is paid for with one death.** At balance a share e^−U of the young survive their genes, however mild each mutation is (Haldane 1937, Muller 1950). With U = 1 that is 37 %; species pay it with spare young.
2. **Damage too slight to be seen does pile up**, in genes below the drift barrier (4·N·h·s < 1): they decay into pseudogenes. But by definition each costs little, and damage stops once a gene is broken in everyone.
3. **Small populations melt down**: drift breaks genes a large population protects (100 adults die out in about 60,000 years in this model).
4. **Sex rebuilds clean genomes**: clones lose their best class again and again (Muller’s ratchet) and die out within about 50,000 years.
5. **Mutations win** when the price is more than the young can pay: too many new ones per birth, too few adults, or no sex. This is the **load paradox**: human estimates of U start at about 2, and e^−U says most conceptions should then fail.
6. **Three escapes lower the price**, each by making a death or a lost mating remove more damage: competition for places (soft selection), synergy (damage that hurts more and more), and selection on males (healthier males father more young, and a damaged male’s lost matings go to other males, so no young go unborn). At U = 5 the plain population dies out within about 14,000 years, and so it does with any one escape at strength 1; with all three it keeps every place filled, and was still at full size after half a million years.

## The model

- **Genome.** 5,120 genes on 20 chromosomes, two copies each. A copy is intact or broken (one bit). Genes come in families of 32 neighbours that share one effect.
- **Effects.** A gene broken in both copies costs s of survival, in one copy h·s, with h = 0.25. The 160 family effects are evenly spaced quantiles of a gamma distribution with shape 0.2 and mean 1 %, as estimated for new amino-acid-changing mutations in humans, shuffled along the chromosomes. About half the genes cost less than 0.1 %. Costs multiply across genes (log fitness = −D, D summed over genes), with optional synergy: log fitness = −D − ε·D²/2.
- **Mutation.** Each gamete gets a Poisson number of hits, mean U/2, on random genes; a hit breaks an intact copy. Repairs (a hit that restores a broken copy) are ten times rarer.
- **Life cycle.** Every female conceives a Poisson number of young (mean 10) by fathers drawn at random among the males. Each young survives to adulthood with probability e^−D (a random draw), then the survivors take the 2,000 places at random. Nobody picks the parents: selection is only that damaged young die more often. The population size is emergent: if fewer than 2,000 young survive, it shrinks, and it can die out. With competition on, up to twice as many young survive and the healthier win places more often (soft selection: a weighted lottery, weights w^c). With selection on males on, each young’s father is drawn with probability in proportion to w^m, w being the male’s own survival fitness, so with m = 1 a male whose damage cut his survival by 10 % also wins 10 % fewer matings (drawn with Walker’s alias method).
- **Meiosis.** 1.5 crossovers per chromosome on average (Poisson), at random places between genes. “Sex without crossing over” passes whole chromosomes; “Clones” copy the mother’s genome.
- **Time.** 25 years per generation: one million years is 40,000 generations, about three minutes on a laptop.
- **Start.** Every genome starts perfect.

Same seed and settings, same run: every random draw comes from one seeded generator (sfc32).

## Validation

Each check is a seeded run of the real simulation set against a prediction from theory. The page shows these results (computed when it was built, about five minutes of runs) and can run any of them again.

| Check | Theory | Simulation | Match if | |
|---|---|---|---|---|
| The price of mutation is e^−U (every gene s = 5 %) | 36.8 % | 37.2 % | ±2 points | match |
| The price does not depend on how harmful each gene is (s = 0.5 %) | 36.8 % | 37.7 % | ±2.5 points | match |
| Broken copies per genome: U/(h·s) | 80.0 | 76.8 | ±7 % | match |
| Milder genes: more broken copies, as Wright predicts | 684 | 684 | ±7 % | match |
| More dominant damage (h = 0.5): fewer broken copies, same price | 40.0 | 39.2 | ±7 % | match |
| Enough young to pay the price, or extinction | U = 2 dies out, U = 1.2 lives | U = 2 died out after 163 generations; U = 1.2 lived | both | match |
| Genes nobody needs decay at the mutation rate (5,000 generations) | 37.8 % broken | 37.1 % | ±1 point | match |
| Neutral substitution rate = mutation rate (Kimura) | 686 | 703 | ±12 % | match |
| Slightly harmful mutations take over too, more rarely (4N·h·s = 2) | 229 | 223 | ±25 % | match |
| Without sex the best genomes are lost for good (Muller’s ratchet) | clones’ fewest climbs, sex stays near 0 | clones 3 → 54, sex 1 → 0 | see page | match |
| Damage that hurts more and more lowers the price (synergy 2) | 46.9 % | 46.6 % | ±2.5 points | match |
| The default genome after a million years: Wright’s forecast | 4,724 broken copies | 4,578 | ±6 % | match |
| … and the share of young that survive it | 44.5 % | 45.3 % | ±3 points | match |
| Selection on males lowers the price to e^−U/(1 + m/2) (every gene s = 5 %, m = 2) | 60.7 % | 60.4 % | ±2.5 points | match |
| Same seed, same run | identical, then different | identical, then different | exact | match |

**15 of 15 match.** The “forecast” sums Wright’s stationary distribution for mutation, repair, selection and drift over all 160 gene families, treating genes as independent.

## Simplifications

- Genes are intact or broken; real damage comes in degrees, and real mutations also hit regulatory DNA, not only genes.
- 5,120 genes instead of about 20,000. So that U stays about one per newborn, each gene gets about four times the real per-gene mutation rate (about 1 in 10,000 per copy per generation).
- 2,000 adults. Real vertebrate populations are often far larger, which lowers the drift barrier; the Lab goes up to 10,000.
- Effects are fixed: no gene ever becomes more or less important, there are no beneficial new functions, and a repair simply reverses the damage (standing in for back and compensatory mutations).
- Families of 32 neighbouring genes share one effect (a computing shortcut that keeps the effect distribution exact with only 160 values).
- Fitness acts on survival from birth to adulthood and, with selection on males on, on males’ matings; every female that wins a place breeds. Generations do not overlap, mating is otherwise random, the sexes are equal in number on average, and there is no geography.
- The three escapes are switches with a strength, not measured values: how strong competition, synergy and selection on males are in real species is still debated.
- Crossovers have no interference and fall evenly along chromosomes; meiosis uses pools of 256 crossover patterns per chromosome, a quarter redrawn every generation.
- The theory lines treat genes as independent; linkage makes selection slightly less efficient than that.

## How it runs

The breeding loop exists twice: in JavaScript (`src/sim/engine.js`) and in C compiled to WebAssembly (`src/wasm/kernel.c`, built into `src/sim/kernel-wasm.js` by `npm run build:wasm` with clang 18). Both make the same random draws and the same floating-point operations in the same order, so they give identical runs (a unit test and a long test check this); the page uses WebAssembly when it can, in a Web Worker so it stays smooth. Young are made and judged one at a time until the places are full, and a young whose damage passes its survival draw part-way through its genome is not finished, so a generation of the default population takes about 4 ms.

## Development

```
npm install
npm test               # unit tests
npm run build          # dist/index.html, running all validation checks (about 5 minutes)
npm run build:quick    # the same, reusing dist/validation.json
npm run test:long      # long runs and scenario outcomes
npm run test:browser   # the page in Chromium at 1280 and 390 px, in a sandboxed frame
```

Code: `src/sim` (engine, effects, theory, settings), `src/app` (page, charts, genome map, lessons, Lab, validation, worker), `tools` (build), `test`.

## References

- Haldane JBS (1937) The effect of variation on fitness. *Am Nat* 71:337–349.
- Muller HJ (1950) Our load of mutations. *Am J Hum Genet* 2:111–176.
- Wright S (1937) The distribution of gene frequencies in populations. *PNAS* 23:307–320.
- Kimura M (1962) On the probability of fixation of mutant genes in a population. *Genetics* 47:713–719.
- Kimura M, Maruyama T, Crow JF (1963) The mutation load in small populations. *Genetics* 48:1303–1312.
- Kimura M, Maruyama T (1966) The mutational load with epistatic gene interactions in fitness. *Genetics* 54:1337–1351.
- Muller HJ (1964) The relation of recombination to mutational advance. *Mutat Res* 1:2–9.
- Haigh J (1978) The accumulation of deleterious genes in a population: Muller’s ratchet. *Theor Popul Biol* 14:251–267.
- Kondrashov AS (1988) Deleterious mutations and the evolution of sexual reproduction. *Nature* 336:435–440.
- Kondrashov AS (1995) Contamination of the genome by very slightly deleterious mutations: why have we not died 100 times over? *J Theor Biol* 175:583–594.
- Wallace B (1975) Hard and soft selection revisited. *Evolution* 29:465–473.
- Agrawal AF (2001) Sexual selection and the maintenance of sexual reproduction. *Nature* 411:692–695.
- Siller S (2001) Sexual selection and the maintenance of sex. *Nature* 411:689–692.
- Whitlock MC, Agrawal AF (2009) Purging the genome with sexual selection: reducing mutation load through selection on males. *Evolution* 63:569–582.
- Lynch M, Conery J, Bürger R (1995) Mutation accumulation and the extinction of small populations. *Am Nat* 146:489–518.
- Eyre-Walker A, Keightley PD (2007) The distribution of fitness effects of new mutations. *Nat Rev Genet* 8:610–618.
- Keightley PD (2012) Rates and fitness consequences of new mutations in humans. *Genetics* 190:295–304.
- Lesecque Y, Keightley PD, Eyre-Walker A (2012) A resolution of the mutation load paradox in humans. *Genetics* 191:1321–1330.
