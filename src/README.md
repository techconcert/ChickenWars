# src layout

```
main.ts            bootstrap: create game, wire sim loop, render, ui
sim/               PURE game logic, deterministic, no browser APIs
  rng.ts           seeded RNG (mulberry32) + helpers, state is a plain number
  state.ts         GameState types and createInitialState(seed, options)
  commands.ts      Command union + validators
  tick.ts          advance(state, commands) -> events; fixed-step
  events.ts        GameEvent union (for UI toasts, audio, render effects)
  constants.ts     TICKS_PER_SECOND, DAY_TICKS, season lengths, caps
  data/            zod schemas + loader for data/*.json, typed registries
  systems/         city.ts economy.ts military.ts heroes.ts world.ts bandits.ts
                   allies.ts combat.ts seasons.ts research.ts quests.ts
  worldgen/        sim-side world generation: regions, biomes, nodes, POIs (pure)
  nav/             hex pathfinding over the nav graph
  save/            serialise, migrate, hash
gen/               procedural content that needs math but not three.js (heightfield, SDF, noise)
  terrain/         port of the prototype terrain approach (worker friendly)
render/            three.js: scene, camera, cel + outline materials, terrain mesh,
                   instanced props, building/unit mesh generators, fog, effects
ui/                Preact components: HUD, panels, tooltips, minimap, menus
platform/          localStorage/IndexedDB saves, settings, input, audio (WebAudio synth)
```

Dependency direction: `ui -> render -> sim`, `platform -> sim`. `sim` depends on nothing but `gen` types and `data`.
