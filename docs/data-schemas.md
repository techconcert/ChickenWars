# Data schemas

Zod schemas live in `src/sim/data/schema.ts` and must mirror these shapes. Files are in `data/`. All ids are `snake_case` strings. Cross references are checked by `npm run validate`.

## Formulas
`cost(level) = round(baseCost[res] * costGrowth^(level-1))` per resource. `buildTicks(level) = round(baseTicks * timeGrowth^(level-1))`. `level` is the level being built (1 = initial construction). Values must be monotone non-decreasing in level (tested).

## resources.json
`[{ id, name, color, icon, startAmount, baseCap }]` ids: feed, twigs, pebbles, golden eggs, chili peppers.

## buildings.json
```ts
{ id, name, category: 'core'|'economy'|'military'|'support'|'defence',
  maxLevel, unlockTH: number, maxCount: number | {byTH: number[]},
  baseCost: Partial<Record<ResourceId, number>>, costGrowth,
  baseTicks, timeGrowth,
  requires?: { building: BuildingId, level: number }[],
  effects: Effect[],        // see below, may depend on level via perLevel arrays
  footprint: 1,             // hex cells, v1 always 1
  mesh: MeshRecipeId }
```
Effect kinds: `produce {res, perMinute: number[] by level}` (converted to per-tick fixed point at load), `cap {res, amount[]}`, `builders {count}`, `marchSlots {count}`, `trainSpeed {troopClass, mult[]}`, `heal {perMinute[]}`, `woundedCap {amount[]}`, `researchSlots`, `heroCandidates`, `vision {radius[]}`, `territory {radius[]}`, `defence {hp[], atk[]}`, `unlock {...}`, `popCap {amount[]}`.

## troops.json
```ts
{ id, name, class: 'infantry'|'archer'|'cavalry'|'siege', tier: 1|2|3,
  atk, def, hp, speed, load, upkeepFoodPerMinute, popCost,
  role?: 'trader' | 'enemy',  // trader: auto-trades, never marches; enemy: human troop used by camps and bosses, cannot be trained
  cost: Partial<Record<ResourceId, number>>, trainTicks, building: BuildingId, minBuildingLevel,
  gatherRate, mesh }
```

## heroes.json
`{ id, name, class, portraitRecipe, baseStats:{atk,def,hp,lead,gather}, growth:{...}, skill: SkillId, talentTree: TreeId, recruit: {kind:'tavern'|'quest'|'start', cost?} }`
`skills.json`: `{ id, name, rage: number, effect: CombatEffect[] }`. `talents.json`: trees with nodes `{id, tier, requires[], effect}`. `items.json`: `{ id, slot, rarity, stats, source }`.

## research.json
`{ id, name, branch, tier, requires[], cost, ticks, effects }`

## world.json
`nodeTypes` (id, resource, biomes, amountByTier, respawnTicks, gatherLimit), `poiTypes` (camp, lair, ruin, village, shrine, cache), `banditCamps` (tier, troops, growth), `bosses`, `regionTiers` (danger 1..6, level range, node density, boss), `events`.

## balance.json
Global knobs: `gatherMult, upkeepMult, raidStrengthCurve, offlineCapTicks, difficulty:{easy,normal,hard}, seasonMods, xpCurve`.

## lords.json, quests.json, clans.json, startTypes.json
See the corresponding system specs.
