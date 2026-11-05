# Marches and navigation

## Nav graph
Cells are micro hexes from the terrain logic layer. Edge cost = `nav.cost[cell]` x level-change penalty: same level 1x; adjacent level via ramp cell 1.5x; cliff edge blocked. Lakes/sea blocked. Roads (built or POI paths) cost 0.7x. Ramps are the only way across levels, so the ramp network is the strategic geography.
A* with a binary heap, hex distance heuristic, deterministic tie-break by cell id. Paths cached per (from,to,unlockVersion) with LRU of 64.

## March
```ts
interface MarchState { id; hero; troops: Record<TroopId, number>; kind: 'gather'|'attack'|'scout'|'garrison'|'rally'|'return';
  target: {cell?: CellId; poi?: PoiId; node?: NodeId; lord?: LordId};
  path: CellId[]; step: number; progress: number /*0..1000*/; state: 'moving'|'gathering'|'fighting'|'returning'|'done';
  carried: Partial<Record<ResourceId, number>>; supply: number; startedAt: number; gatherEndsAt?: number; }
```
- Speed (cells per tick) = slowest troop speed x (1 + research) x terrain factor; about 1 cell per 8 to 15 seconds at baseline.
- Marches into fog can proceed; into locked regions are refused.
- March slots = Grand Coop based (1 at TH1 up to 5), +1 from research. Heroes can only be on one march.
- **Gathering:** on arrival at a node, gather rate = sum(count * troop.gatherRate) * (1 + hero.gather) * season; carry cap = sum(count * troop.load); marches auto-return when full, node depleted, or recalled. Return trip adds the carried amount to the city (capped; overflow warned).
- **Random scout:** a scout march with `target.auto`: it moves at `autoScout.speedMult` (0.25, so 75% slower), and on every arrival picks one of the `pickFrom` nearest reachable unexplored cells at least `minDistance` away (seeded) instead of going home, for up to `maxLegs` legs or until nothing is left or it is recalled. World map button: Marches card, "Random scout".
- **Scout:** a march with at least 1 cavalry reveals a larger radius and can explore ruins; scouts avoid combat (retreat if a camp is adjacent unless ordered).
- **Attack:** on arrival, battle resolves via combat; winners may continue to loot and return. Losers retreat home with survivors.
- **Garrison:** station troops in a village/lord or the city.
- Recall: marches turn around and walk home.
- Idle marches are never created: after the target is done they return.

## Visuals
Render shows a banner + 3 to 7 miniature figures walking the path with a dotted route preview when selected, dust puffs, fatigue bob, and a progress ring over nodes. Marches are interpolated between ticks (smooth movement at any frame rate).

## Tests
Path validity (never crosses cliffs), ramp requirement across levels, determinism, gather math, recall, overflow handling, speed = slowest troop.
