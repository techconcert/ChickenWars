# Architecture

## 1. Stack (see 05-decisions D1 to D4)
TypeScript (strict), Vite, three.js 0.160 (bundled), Preact for UI, Vitest, zod for data validation. Web-first; desktop packaging (Tauri) is a later option and needs no code change.

## 2. Layers
```
            +-----------------------------+
   input -> |  ui (Preact)  / platform    |  HUD, panels, menus, saves, settings
            +--------------+--------------+
                           | dispatch(Command)      ^ subscribe(GameEvent), read(GameState)
            +--------------v--------------+---------+
            |  sim (pure, deterministic)  |   <- worldgen, systems, nav, save
            +--------------+--------------+
                           | read-only snapshot
            +--------------v--------------+
            |  render (three.js)          |   <- gen (heightfield, SDF, noise, meshes)
            +-----------------------------+
```
- `sim` owns truth. `render` and `ui` read state each frame and never mutate it.
- `gen` holds heavy pure maths (height field, SDF, contours) usable from a Web Worker.

## 3. Game state
Single plain-data `GameState` (JSON-safe):
```ts
interface GameState {
  version: number;          // save schema version
  seed: number;             // world seed
  tick: number;             // authoritative clock
  rng: number;              // RNG state (single u32 stream; sub-streams derived by hashing)
  options: GameOptions;     // difficulty, start type, clan, map size
  world: WorldState;        // regions, nodes, pois, fog, bandit camps, lords
  city: CityState;          // buildings, queues, builders, territory
  resources: Record<ResourceId, number>;
  troops: TroopPools;       // home pool by troop id: healthy, wounded, training queue
  heroes: Record<HeroId, HeroState>;
  marches: Record<MarchId, MarchState>;
  research: ResearchState;
  quests: QuestState;
  season: SeasonState;
  log: GameEvent[];         // bounded ring buffer for UI history
  nextId: number;           // id allocator
}
```
Terrain is NOT in state. It is regenerated from `seed` + `options` by `gen/terrain` and is read-only. Only logical cell data (region id, level, biome, ramps) lives in `world`.

## 4. Commands and events
```ts
type Command =
  | { t: 'build'; building: BuildingId; cell: CellId }
  | { t: 'upgrade'; building: InstanceId }
  | { t: 'cancelBuild'; building: InstanceId }
  | { t: 'train'; troop: TroopId; count: number }
  | { t: 'research'; tech: TechId }
  | { t: 'march'; hero: HeroId; troops: Record<TroopId, number>; target: Target; kind: MarchKind }
  | { t: 'recall'; march: MarchId }
  | { t: 'heroTalent'; hero: HeroId; talent: TalentId }
  | { t: 'equip'; hero: HeroId; slot: Slot; item: ItemId | null }
  | { t: 'allyRequest'; lord: LordId; choice: string }
  | { t: 'setSpeed'; speed: 0 | 1 | 2 | 4 }; // recorded for replay but not part of hash-critical sim
```
Each command has a pure `validate(state, cmd): Result` and `apply(state, cmd): GameEvent[]`. Rejected commands return an error code the UI shows.

`advance(state, commands[]): GameEvent[]` runs exactly one tick: apply queued commands, then run systems in fixed order:
1. seasons, 2. city (construction, production), 3. economy (upkeep), 4. research, 5. marches (move, arrive, gather), 6. combat resolution, 7. humans, 8. allies, 9. world respawn/events, 10. quests. Order is documented and tested.

Events (`BuildingCompleted`, `MarchArrived`, `BattleResolved`, `RaidWarning`, ...) drive toasts, sounds, camera pings and render effects.

## 5. Loop and time
- Fixed step: `TICKS_PER_SECOND = 10`. The main loop accumulates real dt and calls `advance` N times (speeds 0/1/2/4). Render runs at display rate and interpolates march positions between ticks.
- Offline catch-up on load: simulate up to `OFFLINE_CAP_TICKS` (default 8 real hours) at maximum speed in chunks, with "safe mode" (raids suppressed, see `systems/time-and-sim.md`). Wall-clock is read only in `platform/` to compute elapsed time and is passed in as a number.

## 6. Data pipeline
`data/*.json` -> zod schemas (`src/sim/data/schema.ts`) -> typed registries (`BUILDINGS[id]`). Loading validates and fails loudly with the file and path. Registries are frozen. `npm run validate` runs in CI/pre-commit. Specs for shapes: `docs/data-schemas.md`.

## 7. Rendering
- three.js, one scene, perspective camera with narrow FOV (about 30 degrees) at an isometric-style pitch (about 35 to 40 degrees), yaw snaps in 90 degree steps, smooth zoom (city -> region -> world).
- Cel shader (3 to 4 bands, rim-free), inverted-hull outlines (back-face, scaled along welded normals), shared via two materials (`celMaterial`, `outlineMaterial`). See `03-art-direction.md`.
- Terrain mesh built in chunks (for example 16x16 world units) from the height field, with LOD rings and frustum culling. Props are `InstancedMesh` per variant and chunk. Buildings and units are small generated meshes, instanced where they repeat.
- Render reads state through a `view model` layer (`render/view/*`) that diffs state each frame and creates/updates/disposes scene objects. No game logic in render.

## 8. Performance budgets (targets, measure on a mid laptop with integrated GPU)
| Item | Budget |
|---|---|
| Frame time | 16 ms at 1080p (60 fps), 33 ms floor |
| Terrain generation (default map) | under 1 s in a worker, UI stays responsive |
| Triangles on screen | under 600k including outline hulls |
| Draw calls | under 300 |
| Sim tick | under 2 ms at endgame state (100 marches/entities, 40 camps) |
| Save size | under 2 MB JSON, under 100 ms to write |
| Cold load | under 5 s |

## 9. Persistence
`platform/save`: JSON in IndexedDB (autosave slot + 3 manual slots + export/import file). Save contains `GameState` only (terrain regenerates). Versioned with migrations in `sim/save/migrate.ts`. A state hash (`sim/save/hash.ts`, FNV-1a over canonical JSON) is stored for integrity and used in determinism tests.

## 10. Testing strategy
- **Unit:** each system with fixtures built via `tests/helpers/makeState.ts`.
- **Determinism:** run 20k ticks from a seed with a scripted command log twice, assert equal hash. Also assert save -> load -> continue equals uninterrupted run.
- **Data:** every JSON file validates; every referenced id exists; costs and times monotone by level.
- **Balance sanity (`tools/balance-sim.ts`):** a scripted bot plays a standard opening; asserts reaching Grand Coop 5 within the target window (see ROADMAP M4).
- **Terrain:** for several seeds, all walkable regions are connected, ramp slope under limit, generation time under budget.
- **Visual:** manual browser check with a screenshot noted in the changelog. A debug page `?debug=terrain` shows toggles like the prototype.

## 11. Folder boundaries (enforced by ESLint)
See `src/README.md`. `sim` cannot import `three`, `preact`, `render`, `ui`, nor touch `window`, `document`, `Math.random`, `Date.now`.
