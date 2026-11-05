# Time and simulation

## Constants (`src/sim/constants.ts`)
`TICKS_PER_SECOND=10`, `DAY_TICKS=600`, `SEASON_DAYS=20`, `YEAR_DAYS=80`, `OFFLINE_CAP_TICKS=288000` (8 h x 3600 x 10), `MAX_SPEED=4`.

## Rules
- Everything timed is `endTick = startTick + duration` in ticks. No wall clock in sim.
- One `advance()` = one tick. System order fixed (see architecture section 4).
- Id allocation via `state.nextId++`. Iteration over records is in sorted key order (use helper `sortedKeys`) to keep determinism.
- RNG: one stream `state.rng`. Sub-systems that need independent randomness derive `hash(seed, systemTag, tick, entityId)` instead of consuming the shared stream, so adding a roll somewhere never reshuffles unrelated events.
- Floating point: sim uses integers for resources/troops/ticks. Positions on the map are hex-cell integers plus progress in 1/1000ths (int). Combat uses integer maths with explicit rounding.

## Offline catch-up (D12)
On load, `platform` passes `elapsedRealMs`. Sim catches up `min(elapsedTicks, OFFLINE_CAP_TICKS)` ticks with `safeMode=true` (D47: the first 3000 ticks exactly, then 300-tick macro steps with scaled rates, marches settled at once; approximate by design): construction/training/research/gathering/heal proceed; raids do not trigger; human outposts grow but stop at their tier cap; seasons advance; marches resolve gather and arrival, battles auto-resolve only if already en route and favourable (otherwise marches return home). UI shows a "While you were away" summary built from events.

## Speeds
0 paused, 1x, 2x, 4x. Speed changes are not sim-affecting state except for the number of ticks run per frame. Auto-pause on: raid warning (setting), battle report, level-up (setting).

## Events
All `GameEvent`s carry `tick`. The UI shows toasts for a whitelist and stores the last 200 in `state.log`.

## Tests
`determinism.test.ts`: two runs, same hash. `catchup.test.ts`: catching up N ticks equals running N ticks (except raids suppressed).
