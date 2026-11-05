# Build contract (module ownership and shared interfaces)

Written by the orchestrator. Every build agent reads this after `CLAUDE.md`. It fixes the seams between modules so agents can work in parallel on disjoint files. Change a seam only by recording a decision in `05-decisions.md`.

## 1. Folders and aliases
```
src/sim/        pure deterministic game logic (no three, DOM, preact, wall clock, Math.random)
src/gen/        pure maths usable from sim, workers and render (terrain logic, height field, base layout, icons recipes)
src/render/     three.js: engine, materials, camera, scenes (base, world), meshes, view models
src/app/        client glue: GameClient (state holder, command queue, fixed-step loop, event bus), ClientView interface
src/ui/         Preact HUD and panels
src/platform/   IndexedDB saves, settings, input keymap, WebAudio synth
tools/          validate-data, balance-sim, screenshot (playwright-core + system Chrome)
tests/          vitest: tests/sim, tests/gen, tests/helpers
```
Aliases (tsconfig + vite): `@sim @gen @render @ui @app @platform @data`.

## 2. Hex conventions (shared by world and base)
Axial coords `(q,r)`, pointy-top, circumradius 1 world unit, as in the prototype: `x = sqrt(3)*(q + r/2)`, `z = 1.5*r`. Neighbour k = `NBQ=[1,0,-1,-1,0,1], NBR=[0,1,1,0,-1,-1]`. A hex map of radius R lists cells in order `for q in -R..R, for r in -R..R if |q+r|<=R`. `CellId` = index in that list. Helpers live in `src/gen/hex.ts` (`makeHexGrid(R)`, `cellQR`, `idxOf`, `hexDistance`, `neighbours`, `hexToWorld`, `worldToCell`).

## 3. Determinism
- The world logic layer (regions, levels, biomes, flags, ramps, nav cost) is computed with integer hash noise and basic float arithmetic only (`+ - * /`, `Math.floor`, `Math.sqrt`, `Math.abs`, `Math.min/max`). No `Math.sin/cos/exp/pow/hypot/atan2` in the logic layer (they are not guaranteed bit-identical across engines).
- The logic layer is copied into `GameState.world` as plain number arrays at new-game time. The sim never needs the generator again during play; render regenerates the height field from `seed + options` and checks `terrainHash`.
- Records are iterated with `sortedKeys` (numeric-aware). Randomness: `state.rng` stream via `rngNext(state)`, or `hashRand(seed, tag, tick, id)` for independent rolls.
- `advance(state, cmds)` mutates `state` in place and returns events. It is pure in the sense that its result depends only on `(state, cmds)`.

## 4. GameState (authoritative shape, `src/sim/state.ts`)
```ts
type ResourceId = 'food'|'wood'|'stone'|'gold'|'ember';
type Res = Partial<Record<ResourceId, number>>;
interface GameState {
  version: number; seed: number; tick: number; rng: number; nextId: number;
  options: { size: 'small'|'standard'; difficulty: 'easy'|'normal'|'hard'; startType: string; clan: string };
  resources: Record<ResourceId, number>;
  accum: Record<ResourceId, number>;              // fixed point x1000 production remainder
  city: CityState; world: WorldState;
  troops: Record<string, { healthy: number; wounded: number }>;
  training: TrainJob[];                           // {id, building: instId, troop, count, startTick|null, endTick|null, cost}
  heroes: Record<string, HeroState>; inventory: Record<string, ItemInstance>;
  tavern: { candidates: string[]; refreshAt: number };
  marches: Record<string, MarchState>; raids: Record<string, RaidState>;
  research: { done: string[]; active: { tech: string; endTick: number }[] };
  quests: { active: string | null; stepProgress: number[]; completed: string[]; counters: Record<string, number> };
  season: { index: 0|1|2|3; dayOfSeason: number; year: number; day: number };
  lords: Record<string, LordState>; rallies: Record<string, RallyState>;
  pendingEvent: { id: string; expiresAt: number } | null; buffs: { stat: string; pct: number; until: number }[];
  reports: BattleReport[];                         // last 20
  log: GameEvent[];                                // last 200
  chronicle: { tick: number; text: string }[];
  stats: { battlesWon: number; battlesLost: number; gathered: number; campsCleared: number; bossesKilled: number };
  flags: { won: boolean; sandbox: boolean; safeMode: boolean };
}
interface CityState {
  radius: number;                       // base grid radius (balance.territoryMaxRadius)
  terrain: number[];                    // per base cell: 0 grass, 1 forest, 2 rock, 3 water, 4 cliff (from gen/base)
  buildings: Record<string, { id: string; type: string; cell: number; level: number; damaged: boolean }>;
  queue: BuildJob[];                    // {id, building: instId, targetLevel, startTick|null, endTick|null, ticks, cost}
  townHall: string;                     // instance id of the town hall
  market: Record<string, number>;       // resource -> last trade tick
}
interface WorldState {
  radius: number; terrainHash: number; capitalCell: number;
  regionOf: number[]; level: number[]; biome: number[]; flags: number[]; navCost: number[];   // per world cell
  regions: { id: number; biome: number; level: number; centroidCell: number; cells: number; neighbours: number[]; dangerTier: number; unlocked: boolean; boss: string | null; lord: string | null }[];
  ramps: { id: number; regionA: number; regionB: number; cells: number[] }[];
  fog: number[];                        // per cell 0 unexplored, 1 explored, 2 visible
  nodes: Record<string, NodeState>;     // {id, type, resource, cell, region, tier, amount, maxAmount, respawnAt|null, gatherer|null, blockedUntil}
  pois: Record<string, PoiState>;       // {id, kind, cell, region, tier, level, active, troops: Stack[], strength, respawnAt|null, raidReadyAt, bossId?, lordId?, explored?}
}
```
Flags bits: bit0 land, bit1 buildable, bit2 walkable, bit3 ramp, bit4 lake, bit5 coast. Biome ids: 0 beach, 1 meadow, 2 forest, 3 highland, 4 snow.
`MarchState` follows `systems/marches-and-nav.md`; `HeroState = { id, level, xp, talents: Record<string, number>, equipment: Record<'weapon'|'armour'|'banner'|'trinket', string|null>, march: string|null, skillRank: number }`.

## 5. Commands, systems, events
- `src/sim/commands.ts` holds the `Command` union (architecture section 4 plus: `demolish, repair, cancelTrain, recruitHero, respec, allyGift, allyTrade, startRally, eventChoice, marketTrade, newGame` is NOT a command) and a dispatch table `{ [t]: { validate(state, cmd): string | null; apply(state, cmd, ctx): void } }`. Each handler is implemented in its system file and imported into the table.
- Each system file `src/sim/systems/<name>.ts` exports `tick<Name>(state, ctx)` plus its command handlers. `ctx = { events: GameEvent[]; safeMode: boolean }`. `src/sim/tick.ts` calls systems in the fixed order: seasons, city, economy, military(training/heal), research, heroes(tavern), marches, combat (resolves arrivals queued by marches), humans, allies, world (respawn/events/fog), quests.
- Events are `{ t: string; tick: number; ... }` discriminated union in `src/sim/events.ts`.
- Validation errors are short codes (`'no_builder'`, `'cost'`, `'locked'`...) mapped to text in `src/ui/strings.ts`.

## 6. Loot scaling (user goal 6)
Every human POI has `level` (1..25): camps `level = (tier-1)*5 + 1 + floor(4 * (strength-base)/(cap-base))`, lairs `tier*5`, bosses `tier*5`. Player level = Grand Coop level. `delta = poi.level - playerLevel`. Loot is rolled from `world.json.lootTables[tier]` with `balance.json.lootScaling`: quantity multiplier `clamp(1 + delta*qtyPerLevel, minMult, maxMult)` and rare-roll weights shifted toward gold/chili peppers/rarer items by `delta*rarePerLevel`. Higher-level humans always give equal or better expected rewards (tested).

## 7. Client seam (`src/app/clientView.ts`)
```ts
type SceneId = 'base' | 'world';
type Selection = { kind: 'building'|'cell'|'node'|'poi'|'march'|'lord'; id: string } | null;
interface ClientView {
  getState(): Readonly<GameState>; getAlpha(): number;             // alpha in [0,1) between ticks for interpolation
  scene: SceneId; setScene(s: SceneId): void;
  selection: Selection; select(s: Selection): void;
  placing: string | null;                                          // building type being placed (base scene)
  setPlacing(type: string | null): void;
  dispatch(cmd: Command): string | null;                           // returns validation error code or null
  on(fn: (events: GameEvent[]) => void): () => void;              // subscribe to events after each tick batch
  focusCell(scene: SceneId, cell: number): void;                   // ask render to move the camera
}
```
Render: `createRenderer(canvas, client): { dispose(); setQuality(q) }` in `src/render/engine.ts`; it owns both scenes and swaps them on `client.scene`. UI never imports three. Dev hooks: `window.__game = { client, advanceTicks(n), state }` when `import.meta.env.DEV` or `?debug`. URL params: `?scene=world`, `?demo=1` (prebuilt mid-game demo state for screenshots), `?seed=N`, `?debug=terrain`, `?debug=gallery`.

## 8. Ownership log
Agents add a line here when they create a top-level area so later agents know who owns what.
- M0+M2 agent: owns `src/sim/**` (except future worldgen/nav bodies), `src/app/**`, temporary `src/main.ts`, `tests/sim/**` (sim tests), `tests/helpers/**`, `tools/validate-data.ts`, `tools/balance-sim.ts`, configs (`tsconfig.json`, `vite.config.ts`, `.eslintrc.json`), `data/*.json` shape via `src/sim/data/schema.ts`. Seams added: `WorldLogicInput` (state.ts) includes `capitalCell`; `createInitialState(seed, options, { worldLogic, baseTerrain })`; handler table `COMMAND_HANDLERS` in `commands.ts` (systems export `handlers` objects); `ClientView` also exposes `speed`, `setSpeed`, `subscribe`.
- Render foundation agent: owns `src/render/materials/**` (`createCelMaterial`, `getCelMaterial({fogOfWar,hover})`, `createOutlineMaterial`, `addOutline(mesh,thickness,colour|null)`, `createWaterMaterial`, `sharedUniforms` + `setTime`/`setSeasonLook`, `createFogTexture`/`bindFogOfWar`, `smoothNormals`), `src/render/camera/**` (`createCameraRig(camera, dom, {bounds,zoomLevels,pitchDeg,fov})` -> `update(dt) yawLeft yawRight focus snapTo setZoomLevel zoomLevelName setEdgeScroll setBounds dispose`), `src/render/meshes/**` (barrel `meshes/index.ts`: `buildBuildingMesh(meshId, level, {banner,roofAccent,damaged,fogOfWar})`, `buildScaffoldMesh(progress)` with `group.userData.setProgress(p)`, `buildUnitMesh(cls,tint,variant)`, `buildMarchGroup(composition,tint)`, `animateMarch`, `animateUnit`, `buildPoiMarker(kind,tier,{faction,danger,icon,banner,fogOfWar})`, `buildNodeModel`, `buildCapitalMarker`, `animateMarker`, `buildSelectionRing`, `animateSelectionRing`, `setHover`, `makeInstanced`, prop geometry factories `makeRockVariant/makePine/makeOak/makeTuft/makeCrate/...`, `GeoBuilder`, `PAL`), `src/render/gallery.ts` + `gallery-entry.ts` (`mountGallery(canvas)`; UI routes `?debug=gallery` to it; standalone page `tools/gallery.html`, views via `?view=buildings-a|buildings-b|buildings-c|halls|units|markers|camps|lairs|nodes|scaffold`, `&fog=1`, `&season=winter`), `src/gen/icons.ts` (`getIcon(id,size)`, `getIconCanvas`, `ICON_IDS`), `tools/screenshot.ts`. Conventions: buildings face +Z, one hex footprint (circumradius 1, fits ~0.85, height <= ~2.2); `wall` spans edge to edge along local X so the base scene rotates it to the neighbour axis. Fog of war texture is red channel 0/0.5/1 (unexplored/explored/visible), bounds via `bindFogOfWar(tex, minX, minZ, sizeX, sizeZ)`; materials must be requested with `fogOfWar: true` to sample it. Call `setTime(t)` and `setSeasonLook` once per frame; materials are shared across scenes.

- M1 terrain agent (gen): owns `src/gen/hex.ts`, `src/gen/noise.ts`, `src/gen/terrain/**`, `src/gen/base/**`, `tests/gen/**`. Main exports: `generateTerrainLogic(seed, {radius, startType?})`, `toPlainLogic(logic)` (sea cells `regionOf = -1`; plain object also carries `bridges`; sim adds `capitalCell`, dangerTier etc.), `canStep(logic, a, b)`, `reachable`, `hashLogic`; `buildHeightField(logic, {sampleSize, cliffWidth, onProgress, now})`; `generatePlacements(field)`; `generateTerrainSync/generateTerrainAsync(params, onProgress)` returning `TerrainBundle {params, logic, field, placements, timings}` (`src/gen/terrain/client.ts`, worker in `worker.ts`); queries `heightAt, slopeAt, isWalkableAt, distanceToCliff, nearestRamp` (`queries.ts`); contours `extractContours/chainPoint`; base: `generateBaseTerrain(seed, radius=16)`, `buildBaseHeightField(terrain, radius, seed)` (`src/gen/base/layout.ts`). Types and flag/biome constants in `src/gen/terrain/types.ts`.
- M5 combat agent: owns `src/sim/combat/**` (`resolver.ts` resolveBattle, `modifiers.ts` documented combat constants, `loot.ts` rollLoot/expectedLootValue/rewardLabel, `power.ts` stacksPower/campLevel), `systems/combat.ts` (tickCombat, enemyOf), `systems/bandits.ts` (growth, respawn, `checkRaids` stub for M7). Seam added: additive `MarchState.wounded?: Record<troop, n>`; combat sets it and shrinks `march.troops` to survivors, then sets the march `returning` with `path = []` and `march.report`. **marches must add `march.wounded` to `state.troops[t].wounded` (military `addWounded`) when the march returns, then clear it.** Quest counters written: `campCleared`, `campCleared_t<tier>`, `bossesKilled`. Cleared camps are reset to base and respawn (3..5 days) on a free nearby cell in the same region.
- M3 sim agent: owns `src/sim/systems/{city,economy,military}.ts`, `src/sim/city/**` (exports: `adjacencyBonus(state,type,cell)` in `adjacency.ts`; `getCaps` in `caps.ts`; `getPopulation` in `pop.ts`; `getRates`, `upkeepPerMinute` in `production.ts`; `territoryRadius`, `inTerritory`, `cellError`, `placementError`, `getBuilders`, `maxQueueLength` in `territory.ts`; `repairCost` from `systems/city`; `addWounded`, `woundedShare`, `woundedCap`, `trainCost`, `trainDuration` from `systems/military`; `getCaps`, `getRates`, `getPopulation`, `tradeRatio` re-exported from `systems/economy`), `tools/balance-sim.ts` (`runOpening()`), `tests/sim/{city,economy,military}*.test.ts`. Additive seams: events `BuildingUpgraded`, `WoundedDied`; optional `GameState.healAccum`.
- M4 sim agent: owns `src/sim/nav/**` (A*, fog, march math, modifiers), `src/sim/worldgen/**` (overlay, spawn, place, testLogic), `src/sim/systems/marches.ts`, `world.ts`, `src/sim/heroStats.ts`. Seams: additive `MarchState.gatherAcc?`; `region.boss` holds the boss POI id; garrison marches wait in phase `done`; path[0] is the capital, `step`/`progress` index the edge to path[step+1]; supply is reserved from food and refunded in full on return (economy already charges marching upkeep); counters `gathered`, `cellsExplored`, `ruinExplored`, `cachesFound`; `makeTestWorldLogicRich` for multi-level tests.
- M9 sim agent: owns `src/sim/systems/quests.ts`, `src/sim/quests/**` (`runQuests`, `ensureActiveBase`, `activeQuests(state)` -> `QuestView[]`, `deriveCounters`, `grantRewards`, step helpers), `src/sim/progression/**` (`reignProgress`, `finalBossTier`, `checkWin`, `computeScore`, `addChronicle`, `clanBonus`, `CLAN_EFFECT_CONSUMERS`, `dailySeed`, `Profile`/`recordRun`/`emptyProfile`), `data/quests.json`. Seams: additive `GameState.quests.base?/side?`, command `continueSandbox`, event `QuestStarted`, quest schema `trigger`/`troops`/step kinds `heroRecruited|bossKilled|counter`. Counters written by quests: `trained_<troop>`, `researchDone`, `heroRecruited`, `bossKilled_t<tier>`, `raidsWon`, `raidsLost`, `giftGivenEv`, `reign`. Allies should bump `giftGiven`; humans need not bump `raidsLost`/`raidsWon` (derived from `RaidResolved`; do not bump them elsewhere or they double count).
- M6 sim agent: owns `systems/heroes.ts` (`grantHero`, `grantHeroXp`, `itemWearer`, handlers heroTalent/respec/equip/upgradeItem/recruitHero), `systems/research.ts` (`academyLevel`, `researchSlots`, `researchError`), `src/sim/heroes/**` (`constants` ITEM_*/`itemUpgradeCost`, `xp`, `talents` `skillRankOf`/`talentError`, `tavern` `tavernLevel`/`rollCandidates`/`refreshTavern`, `mods` `heroCombatMods`/`heroSideMods`), `src/sim/research/bonus.ts` (`researchBonus`, `RESEARCH_CAPS`, `researchEffects`), `heroStats` item upgrades. Additive: command `upgradeItem`, event `ItemUpgraded`, effect kinds (see D28); edited `systems/combat.ts` (giveXp -> `grantHeroXp`), `city/modifiers.ts` (`researchProdPct` -> `researchBonus`), `tools/validate-data.ts` (cycle check).
- UI agent: owns `src/ui/**` (Preact; `mountUI(root, client, getRenderStats, debug)` in `src/ui/index.ts`, `ui` store for panels/toasts, `useGame()` context), `src/platform/**` (`save.ts` slots auto/slot1..3 + internal `pending` for load-by-reload, `settings.ts`, `input.ts`, `audio.ts` with `audio.play` stub and `eventSounds`), `src/main.ts`, `src/app/newGame.ts` (`createNewGame`, `pickCapitalCell`, `startTypeParams`), `src/app/demo.ts` (`buildDemoState`). Renderer is loaded via `import.meta.glob('./render/engine.ts')` and must export `createRenderer(canvas, client)` returning `{dispose, frame(dt), getStats?}`; render emits `hl-hover` and `hl-terrain-progress` window events.
- M7/M8 sim agent (raids, offline, allies): owns `src/sim/raids/**` (`launchRaids`, `tickRaids`, `resolveRaid`, `raidConditions`, `raidThreshold`, `warningTicks`, `raidCell`, `cityDefence`, `protectedFraction`, `clanSideMods`, `ambushChance`, `tickAmbush`, `safeAttackFavourable`), `src/sim/allies/**` (`lordStage`, `changeRep`, `giftRep`, `tradeRatioPm`, `tradeYield`, `lordLentStacks`, `lordVisionSources`, `rallyAugment`, `rallySplit`, `lootShares`, request helpers), `systems/allies.ts`, `systems/bandits.ts` (`checkRaids`). Seams: additive state fields (`RaidState.warnAt/warned/launchedAt`, `LordState.tradesToday/nextRequestAt/stageSeen`, `LordRequest.template/postedAt/accepted`, `RallyState.arriveAt/departed/contrib`, `MarchState.ambushChecked`, `BattleReport.kind/woundedB/damaged`), events (`RaidLaunched`, `AmbushResolved`, `AttackAborted`, `LordStageChanged`, `RequestFulfilled`, `LordGift`, `LordPerk`, `RallyDeparted`), data (`balance.raidRange/raids/allies`, `difficulty.*.raidThresholdMult`, `lords.json` `army` + `hero`). `systems/combat.ts` gained 5 hook lines (safe-mode attack gate, rally augment/split/loot/done, clan class mods).
- Render scenes agent: owns `src/render/engine.ts`, `scenes/**`, `terrain/**`, `view/**`, `fx/**`, `picking.ts`, `tools/scenes.html`. `createRenderer(canvas, client)` returns `{ frame(dtMs), setQuality('low'|'medium'|'high'), getStats(): {fps, drawCalls, triangles, terrainTriangles?, propInstances?}, getScene(id), dispose() }`. **main.ts calls `client.frame(dt)` then `renderer.frame(dt)` each rAF (the renderer has no loop).** Scene swap by polling `client.scene`; each scene keeps its own camera state (rig recreated on activation). Focus: renderer calls `client.registerFocus` if present. Window events (CustomEvent detail): `hl-hover` `{scene, cell, kind, id, sx, sy}` plus for base placing `{type, valid, error, bonus}`; `hl-place-error` `{code, cell, type}`; `hl-terrain-progress` `{p, stage}` (stage 'ready' = done, 'error' on failure); `hl-terrain-mismatch` `{expected, actual}`. Selection kinds produced: base `building`; world `node`, `poi`, `lord` (village with lordId), `march`, `cell` (ground and capital). Reads `localStorage['hl-settings'].reducedMotion`.
- Sim wiring/bot agent: owns all of `src/sim/**`, `tools/balance-sim.ts`, `tools/bot/**`, `tools/bench-sim.ts`. New seams: `src/sim/bonuses.ts`, `heroes/mods.playerSideMods`, command `acceptHeroOffer`, research field `requiresFlag`, hero `recruit.kind 'ally'`, `raids.raidTierAllowed`, validation codes `flag` `no_offer` `owned` (UI strings needed), `BuildJob.ticks` = effective duration. See D30.
- Post-audit agent: added `systems/bridges.ts` (`unlockBridges`, `lockedBridgeCount`), `combat/preview.ts` (`battlePreview`), `render/view/bridges.ts` (`BridgeLayer`), `ui/components/BattleBrief.tsx`, `tests/sim/{bridges,preview}.test.ts`. Seams: `WorldState.bridges?`, `WorldLogicInput.bridges?`, nav `bridgeLocked`/`PathOpts.ignoreBridges`, building effect `tradeLimit`, research/clan effect `unlockBridges`, event effect `gamble`, event `BridgeUnlocked`, `BattleSide.enrage`, `BattleResult.phase2Round`, marcher code `bridge_locked`, `over_limit`. See D33.
