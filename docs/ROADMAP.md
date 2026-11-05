# Roadmap

Do milestones in order. Each has: scope, specs to read, acceptance checklist (tick when verified), and a pacing target where relevant. Tick boxes in this file as you finish and add a line to `CHANGELOG.md`.

---
## M0. Bootstrap and tooling
Specs: `01-architecture.md`, `CLAUDE.md`.
- [x] `npm install`, `npm run dev` shows an empty three.js scene (sky colour, one cube) in `#game` canvas
- [x] Folder skeleton from `src/README.md` created with placeholder index files
- [x] ESLint boundary rules active; a deliberate `Math.random` in `src/sim` fails lint (verify then remove)
- [x] Vitest runs a trivial test; `tools/validate-data.ts` runs and validates `data/*.json` with zod
- [x] `docs/CHANGELOG.md` updated

## M1. Terrain port and fixes
Specs: `04-terrain.md`, `03-art-direction.md`, `HANDOFF.md`.
- [x] Prototype terrain reproduced in `src/gen/terrain` (pure) and `src/render/terrain` (three), debug page `?debug=terrain` with the prototype's toggles
- [x] Generation runs in a Web Worker with progress; default map under 1 s (record timing)
- [x] Fixes T1: readable ramps, no over-steep ramps (re-route/widen), circular sea fade, sharper cliffs, plateau reach
- [x] Chunked meshing + LOD (T2, T3); "Standard" map (radius 60) at 60 fps on mid laptop or documented best-effort numbers
- [x] `TerrainLogic` exported (T5) and hashed; tests for connectivity, ramp slope, logic-layer determinism across 5 seeds
- [x] Camera controls: pan, zoom (3 levels), yaw snap

## M2. Sim core
Specs: `01-architecture.md`, `systems/time-and-sim.md`, `systems/save.md`, `data-schemas.md`.
- [x] `GameState`, seeded RNG, `advance`, command validation, event bus
- [x] Data loader + zod schemas for all files in `data/`; typed registries
- [x] Save/load/migrate/hash; IndexedDB slots + export/import (sim side done: hash/serialize/migrate; IndexedDB + file export belong to the UI/platform agent)
- [x] Determinism test (20k ticks) and save round-trip test green
- [x] Main loop with speeds 0/1/2/4 and render interpolation hooks
- [x] Debug overlay: tick, day, season, state hash

## M3. City and economy
Specs: `systems/city.md`, `systems/economy.md`, `systems/ui.md`.
- [x] Generated building meshes for all launch buildings (see systems/city.md) (flat-colour, outlined) with level variants (18 meshes incl. market, levels 1/5/10: `gallery-buildings-{a,b,c}.png`, `gallery-halls.png`)
- [x] Placement UI on buildable hexes inside territory, with ghost preview and validity colours (`placement-valid.png`, `placement-invalid.png`)
- [x] Construction queue, builder slots, upgrades, cancel with 100% refund before 10% progress else 50%
- [x] Production and upkeep per `economy.md`; feed silo caps; HUD resource bar
- [x] Balance bot reaches Grand Coop 3 in 8 to 12 minutes of simulated 1x time
- [x] Unit tests: costs monotone, caps, upkeep, queue behaviour

## M4. World, marches and gathering
Specs: `systems/world.md`, `systems/marches-and-nav.md`, `systems/seasons.md` (gather modifiers only).
- [x] Worldgen places regions' danger tiers, resource nodes, POIs from the terrain logic layer, deterministic by seed
- [x] Hex nav A*; marches move along path respecting ramps/cliffs (`march-minimap.png` shows a march in motion; sim path tests)
- [x] Gather marches: load, depletion, return, respawn timers
- [x] Fog of war (3 states), scouting reveals radius; minimap (fog and minimap in `march-minimap.png`)
- [x] March panel (slots limited by Grand Coop level), recall, speed by slowest troop
- [x] Tests: path validity, gather yields, node respawn determinism

## M5. Military and combat
Specs: `systems/military.md`, `systems/combat.md`, `systems/bandits.md` (static camps only).
- [x] Troop training queues at barracks/archery/stable/workshop; upkeep; nursing nest healing (military.test.ts; queue visible in the demo HUD and Army panel)
- [x] Round-based combat resolver with counters, terrain/level modifier, rage; unit tests incl. counter triangle outcomes
- [x] Attack marches vs human outposts; battle report panel; procedural battle animation (short)
- [x] Loot and wounded rules (loot.test.ts, combatSystem.test.ts wounded split, military.test.ts wounded share/heal/cap)
- [x] Balance bot clears a Tier-1 camp at Grand Coop 3 with a basic army (tests/sim/balanceBot.test.ts)

## M6. Heroes and research
Specs: `systems/heroes.md`, `systems/research.md`.
- [x] Hero roster, XP/levels, talent trees, active skills wired into combat, equipment slots and loot drops
- [x] Research tree (economy, military, defence) with Owl Academy
- [x] Worm Tavern recruits; hero panel UI
- [x] Tests: xp curve, talent prerequisites, skill effects deterministic

## M7. Escalation: humans, seasons, regions, bosses
Specs: `systems/bandits.md`, `systems/seasons.md`, `systems/world.md` (regions/bosses).
- [x] Camp growth, raids with warning (RaidWarning event, 2 minutes lead), city defence resolution with walls/towers (sim)
- [x] Seasons with gather/upkeep/human modifiers and visual changes (seasons.test.ts modifiers, `final-world-winter.png`, `final-world-autumn.png`)
- [x] Lairs, region bosses, region unlock and territory expansion (humans/combatSystem tests; territory reading in D33(g); boss phase 2 and bridges added)
- [x] Offline catch-up safe mode (D12) implemented and tested
- [x] Balance bot survives a full year at Normal difficulty (tests/sim/balanceBot.test.ts)

## M8. Allies
Specs: `systems/allies.md`.
- [x] Lords placed per region, reputation stages, gifts, requests, trades (sim)
- [x] Rallies: allied lords join marches to human compounds and bosses; shared loot rules (sim)
- [x] Ally UI, diplomacy panel, tests for reputation transitions

## M9. Progression, quests, new game
Specs: `systems/progression-and-quests.md`, `systems/start-types.md`.
- [x] Quest/tutorial chain through Grand Coop 5, event cards (random seeded events)
- [x] New game screen: seed, size, difficulty, start type, clan; 3 start types and 4 clans
- [x] Win condition "Reign" and end screen; sandbox continue
- [x] Settings (graphics quality, audio, keybinds), pause menu, save slots UI

## M10. Polish and performance
Specs: `03-art-direction.md`, `01-architecture.md` section 8.
- [x] Season lighting, weather particles, water, fog styling, selection and hover feedback
- [x] Procedural audio: SFX set + one music loop; mute by default until interaction
- [x] Performance pass meeting budgets or documented exceptions (CHANGELOG 'Performance' section)
- [x] PWA/offline build; production build documented in README
- [x] Accessibility: colour-blind safe markers, UI scale, reduced motion
- [x] Full playthrough by balance bot and a manual smoke test checklist in `docs/QA.md` (QA.md done)

---
## Pacing targets (Normal, 1x)
| Milestone | Target time |
|---|---|
| Grand Coop 3 | 8 to 12 min |
| Grand Coop 5 | 30 to 45 min |
| First region boss | 45 to 70 min |
| Grand Coop 10 | 3 to 4 h |
| Reign (win) | 8 to 12 h |
