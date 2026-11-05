# 12. Performance review (2026-10-26)

Scope: sim tick, worldgen / new game, offline catch-up, UI (Preact HUD), render, platform (save, audio).
Rule for this pass: only changes that cannot alter results. The sim stays byte-identical (same iteration orders, RNG
calls, rounding and float evaluation order); no visual, behaviour or balance change. Anything that could shift a result
even slightly is listed under "Not changed" as a recommendation.

## How it was measured

- Sim: `npx tsx tools/bench-sim.ts` (endgame state: 100 marches, 68 camps, 66 buildings, 100 heroes), CPU profiles with
  `node --cpu-prof`, plus a min-of-7 microbench of `advance`, `computeProduction` and `getCaps`.
- Determinism: a harness ran five scenarios (flat test island seed 1337, rich island seed 7, real terrain r40 seed 1337,
  real terrain r60 seed 42, the endgame bench state) for 20000-25000 ticks with the fuzz command script, then an 8 h
  `catchUp`. It recorded the FNV state hash, a SHA-256 of the canonical JSON, a SHA-256 of every event batch and of the
  offline events. All five were identical before and after.
- New game: `buildWorldLogic` + `createInitialState`, bundled with esbuild (no tsx `__name` wrappers, which inflate
  closure-heavy code 2-3x under tsx) and run in node, min of 3. The height field was compared bit-exactly (SHA-256 of
  every typed array) for 5 worlds across the three start types.
- Browser: headless Chrome (Metal ANGLE) on the dev server, `?demo=1&size=standard`, 1600x900, 5 s per scene,
  `renderer.frame` CPU time, CDP `Performance.getMetrics` and a CPU profile. Before = the untouched copy served from the
  backup folder, after = the working tree.

## Ranked findings

| # | Area | Finding | Measured cost (before) | Risk of fix | Status |
|---|---|---|---|---|---|
| 1 | sim | `sortedKeys` ran a regex per comparison and re-sorted every record on every call (heroes, pois, nodes...), ~50% of tick time at endgame | 0.42 ms/tick bench, 50% inclusive | none: comparator is a strict total order, result depends only on the key set | done |
| 2 | sim | `cityTalentSum` (via `capMultPct` per resource, `upkeepPct`, ...) re-sorted the hero keys and each hero's talent keys on every call | 17% of tick (100 heroes) | none (same order, now cached) | done via #1 |
| 3 | sim | `getCaps` re-sorted the building ids once per resource (5x) | part of 31% | none | done |
| 4 | sim | `effectsAt` rebuilt resolved effect objects on every call (caps, production, pop, fog, military...) | 5-9% of tick | none: data is deep-frozen; cached lists are frozen too | done |
| 5 | sim | `computeProduction` recomputed research / clan / buff / season factors per producing building (research walk allocates per call) | 76 us per call (all research) | none: same values per resource | done |
| 6 | sim | `researchBonus` built a temporary array of all research effects per call | allocation per call | none: same order | done |
| 7 | worldgen | node placement rescanned the candidate order from the start for each node (quadratic, `nodeFits` ~32% of new-game overlay) | r60 createInitialState 40 ms, r80 107 ms | none: placing nodes only adds blockers, so earlier rejects stay rejected | done |
| 8 | new game | `buildWorldLogic` builds the full height field on the main thread to flag steep cells (`F_STEEP`): r60 0.8-1.0 s main-thread block | 0.8-1.0 s (r60) | needs architecture change | partly: noise + ramp noise cache (see below); recommendation R1 |
| 9 | terrain gen | `makeNoise().n3` created a corner-hash closure per sample; `fillRamps` re-evaluated the same edge noise for every sample on every slope-fix pass | ~25-30% of the field build | none: same calls, same float maths; float64 cache | done |
| 10 | UI | Minimap redrew ~3600-11000 cell squares (string colour per cell) on every 8 Hz render | ~2.8% of main thread in the world scene | none: offscreen layer copied 1:1; compositing checked bit-exact | done |
| 11 | UI | TopBar: each of the 5 resource chips called `getCaps` + `getRates` | 5x per 8 Hz render | none | done |
| 12 | offline | `catchUp` (8 h) is dominated by the 3000 exact ticks, so it scales with #1-#6 | endgame 1.87 s | none | improved via #1-#6 |
| 13 | render | frame CPU 1.1-1.9 ms, 94-122 draw calls, 204-331k triangles at demo; per-frame allocations already pooled in hot paths; GC < 0.3% | within budget | n/a | no change |
| 14 | render | `engine.resize()` reads `canvas.clientWidth` every frame (forced layout after 8 Hz DOM updates) | ~0.6% self | low | recommendation R4 |
| 15 | platform | autosave: 230 KB JSON at day ~80 on r60; `serialize` + stringify 3-4 ms, `hashState` 2.3 ms | far under the 100 ms budget | n/a | no change |
| 16 | platform | audio: 200 ms lookahead scheduler, noise buffer cached; settings subscribers trivial | negligible | n/a | no change |
| 17 | build | three.js chunk 511 kB (132 kB gz), app 484 kB (153 kB gz); offline PWA, cold load well under 5 s | n/a | n/a | no change |

## What changed (before -> after)

| Measure | Before | After |
|---|---|---|
| `tools/bench-sim.ts` endgame avg tick | 0.335-0.42 ms | 0.157-0.17 ms |
| `advance` endgame, min of 7 | 0.308 ms | 0.140 ms |
| `advance` endgame with all research done, min of 7 | 0.416 ms | 0.216 ms |
| `getCaps` (100 heroes) | 123 us | 42 us |
| `computeProduction` (all research) | 76 us | 54 us |
| per tick, flat / rich / real r40 / real r60 (20k ticks, fuzz script) | 0.039 / 0.055 / 0.085 / 0.101 ms | 0.013 / 0.015 / 0.023 / 0.033 ms |
| `catchUp` 8 h, flat / rich / r40 / r60 / endgame | 189 / 238 / 365 / 394 / 1866 ms | 47 / 60 / 98 / 152 / 658 ms |
| `createInitialState` (world overlay) r60 / r80 | 41 / 107 ms | 17-22 / 43-53 ms |
| `buildWorldLogic` r40 / r60 (bundled node, min of 3) | 232 / 800-1020 ms | 195 / 573-693 ms |
| Minimap share of main thread (world scene) | ~2.8% | ~0.1% |
| World scene script time per 5 s (headless Chrome, noisy) | 0.64 s | 0.58 s |

Files: `src/sim/util.ts` (`sortedKeys` fast path + per-record cache, regex-free `isNum`), `src/sim/city/caps.ts`,
`src/sim/data/registry.ts` (`effectsAt` cache, now returns a readonly frozen list), `src/sim/city/production.ts`,
`src/sim/research/bonus.ts`, `src/sim/worldgen/index.ts`, `src/gen/noise.ts`, `src/gen/terrain/field.ts`,
`src/gen/terrain/fieldRamps.ts`, `src/ui/components/Minimap.tsx`, `src/ui/components/TopBar.tsx`.
New test: `tests/sim/perfCaches.test.ts`.

Why each sim change is result-identical:
- `compareKeys` returns 0 only for equal strings and orders by (numeric?, Number value, code units), a strict total
  order, so any correct sort of the same key set gives the same array. Returning `Object.keys` unsorted when it is already
  in order, or a copy of the previous result when the key sequence is unchanged, is that same array. The cache is a
  module `WeakMap`, never part of `GameState`.
- `effectsAt`: resolved values are a pure function of frozen data and the level. Callers only read the lists.
- `computeProduction` / `researchBonus` / `getCaps`: the same function calls with the same arguments, hoisted out of
  loops whose bodies do not change their inputs; summation order is unchanged.
- Node placement: `nodeFits` only gets stricter as nodes are added and the type choice does not depend on the scan
  position, so resuming the scan after the previous pick yields the same picks.
- `n3`: identical hash calls and lerp order without the closure. Ramp edge noise is cached as float64, so the cached
  value is exactly the computed one.

## Not changed (recommendations)

- R1. New game blocks the main thread 0.6-0.7 s (r60) in `buildWorldLogic` because the steep-cell flags need the full
  height field, and the terrain worker builds the same field again for the mesh. Options: compute `F_STEEP` in the
  worker and await it before `createInitialState`, or hand the main-thread field to the renderer. Both change boot
  order and the worker contract, so not done here.
- R2. `cityTalentSum` walks every hero and talent for each (kind, filter) call, about 10 times per tick. A per-tick
  table would need the same per-stat summation order to stay bit-identical; with the usual handful of heroes the cost
  is small, it only shows with the bench's 100 heroes.
- R3. `markClearedRegions` scans all POIs every tick (`tickAmbush`) and rewrites the same counters. Running it only when
  a camp is cleared needs every deactivation path audited; ~5% of the endgame tick.
- R4. `engine.resize()` reads `clientWidth` each frame; a `ResizeObserver` would avoid forced layouts, but resize would
  apply one frame later.
- R5. `marchEta` (MarchesList, WorldPanels) calls `progressPerTick` per path step, recomputing `marchSpeedMult` each
  step. UI-only and not visible in profiles.
- R6. Triangles: fully explored r40 world was 658k at default zoom (changelog), above the 600k budget; trees dominate.
  Fixing it means LOD or density changes, which are visual.
- R7. Height-field SDF/chamfer/blur passes are already tight typed-array loops; further gains (e.g. fewer slope-fix
  passes) would change the field.

## Not verified

- Frame times on a real integrated-GPU laptop; headless Chrome numbers are noisy (renderMs varied 1.1-1.9 ms between runs
  without code changes in the render path).
- Mobile/Safari behaviour of the minimap offscreen canvas (standard 2D canvas API, no new features used).
