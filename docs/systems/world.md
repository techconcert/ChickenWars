# World

## Structure
World = logic layer from terrain (`04-terrain.md`) + gameplay overlay from `sim/worldgen`. All placement is deterministic from the seed and uses sub-seeds per feature type.

## Regions
Macro regions each get `dangerTier` 1..6 by distance (path distance in region graph) from the capital region: tier 1 = home region (safe), up to tier 6 = final. Region has a biome, level, resource profile and a **boss** at its centre-most POI. A region next to an open one also opens by itself when the Grand Coop reaches its tier's `unlockCityLevel` (`world.json` `regionTiers`: tier 3 at Grand Coop 5, tier 4 at 9, tier 5 at 14, tier 6 at 19; `systems/world.ts`). Defeating a boss **unlocks** the neighbouring higher-tier regions' ramps (fog and march-blocking until then: marches into locked regions are refused with a clear message).

## Fog of war
Three states per cell: unexplored (not rendered, parchment tint), explored (static info only), visible (live). Vision: city buildings radius (lookout perch 8, town hall 6), marches radius 4 (+research), scout units radius 7. Stored as a byte array (bitset) in state (`world.fog`, base64 in saves).

## Resource nodes
Types: forest (wood), farmland (food), pebble pit (stone), goldvein (gold), emberseam (chili peppers, tier >= 3). Each node: `amount`, `maxAmount`, `tier` by region, `respawnAt`. Gathering reduces `amount`; at 0 the node vanishes and respawns at the same cell after `respawnTicks` (about 1 to 2 game days) with 50% of max, growing back. Max simultaneous gatherers per node: 1 (v1, simple).
Density scales with region tier (richer far away). Biome decides which node types spawn.

## POIs
| type | behaviour |
|---|---|
| human_camp | enemy troops, grow, source of raids (see humans.md) |
| lair | tough camp with unique drops, unlocks region parts, guarded by a miniboss |
| boss | region guardian, one per region, respawns never |
| ruin | one-time explore for loot or hero recruit (needs a scout) |
| village | trade partner / lord's holding, unlocks ally reputation |
| shrine | scout it once (any troops): a one-time blessing, a 2-day buff (+25% production 40%, +40% gathering 30%, +60% healing 15%) or hero experience 150 x tier (15%); roll seeded; shows a toast and a chronicle line |
| cache | hidden resource stash found by scouting |
Placement rules: min distance between POIs, never on ramps/lakes, reachable via nav, density by region tier.

## Events
Seeded random events appear (1 per ~2 game days): travelling merchant, wolves attack a node (blocks it), harvest festival (+gather), plague (-heal), caravan to escort. Each is 2 to 3 options with consequences, data-driven in `world.json`.

## Minimap and map UI
Minimap canvas generated from logic layer (region colours + fog), clickable. World zoom hides props, shows region borders, boss and camp icons, march lines.

## Tests
Worldgen determinism, reachability of every POI and node from capital (through unlockable ramps), boss uniqueness, node respawn timing.

## Random events
One event is offered every `balance.eventIntervalDays` (10) days, picked with `hashRand(seed,'event',day)` from the authored events in `world.json` plus the generated pool (see D43, `data/events.json`). Each shows a title, a short text and 2 to 3 options as a collapsible strip under the top bar; unanswered events expire.
