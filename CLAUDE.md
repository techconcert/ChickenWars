# CLAUDE.md: rules for build agents

You are building **ChickenWars** (code ids still use the old fantasy names, see `docs/08-theme.md`), a single-player offline 4X game where you play a flock of chickens against humans. Work autonomously through `docs/ROADMAP.md`, one milestone at a time, in order.

## Read order
1. `docs/00-overview.md` (what and why)
2. `docs/01-architecture.md` (layers and hard rules)
3. `docs/02-approach.md` (how to work, definition of done)
4. `docs/ROADMAP.md`, then the specs the current milestone links to
5. `docs/05-decisions.md` before changing any decision. Add a new entry instead of silently deviating.

## Hard rules
- **Sim is pure.** `src/sim/**` imports no three.js, DOM, Preact or `@render`/`@ui`. No `Math.random`, no `Date.now`, no `performance.now`. Time is `state.tick`. Randomness is the seeded RNG in `src/sim/rng.ts`. ESLint enforces this; do not disable the rules.
- **State is plain data.** `GameState` is JSON-serialisable: no classes, Maps, Sets, functions or cycles. Use records and arrays. Ids are strings or ints.
- **All changes go through commands.** UI and render never mutate state. They dispatch `Command`s; `sim` validates and applies them in the tick loop. See `docs/01-architecture.md`.
- **Content is data.** Numbers live in `data/*.json`, validated by zod schemas in `src/sim/data/schema.ts`. No balance numbers in code except documented constants in `src/sim/constants.ts`.
- **No external art.** Meshes, textures, icons and sounds are generated in code (`src/gen`, `src/render`). No image/model files in the repo except `reference/`.
- **No monetisation patterns.** No premium currency, speedups, energy, or paywalled anything. Builder slots, not timers, are the constraint.
- **Offline.** No network calls at runtime. three.js is bundled via npm, not a CDN.
- **Determinism test must stay green.** Same seed + same command log = identical state hash.

## Working style
- Small commits per vertical slice. Each milestone ends with: tests green, `npm run typecheck`, `npm run lint`, the milestone's acceptance checklist ticked in `docs/ROADMAP.md`, and a short note in `docs/CHANGELOG.md`.
- Write the failing test first for sim logic. Visual work is verified in the browser (screenshot) and noted in the changelog.
- If a spec is ambiguous, pick the simplest reading, record it in `docs/05-decisions.md`, and continue. Add a question to `docs/06-open-questions.md` only if the answer would change player-visible design.
- Do not edit `prototypes/` or `reference/`. Port code out of the prototype into `src/gen` and `src/render`, cleaning it as you go.
- Keep files under ~500 lines. Split by responsibility.
- Performance budgets are in `docs/01-architecture.md` section 8. Measure before optimising.
