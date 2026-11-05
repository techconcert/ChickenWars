# City

## Model
The capital is a Grand Coop on a start cell. **Territory** is the set of land cells within `territory.radius[THlevel]` hex distance of the Grand Coop (radius 4 at TH1 growing to 12 at TH10, cap 16), limited to the capital's region plus connected walkable cells. Buildings occupy one buildable hex each inside territory. Cells on cliffs, lakes, ramps and shore are not buildable.

## Builders
`builders` = 1 at start; +1 at TH3 (Builder Hen's Shed building, level-based) up to 4. Each queued construction/upgrade occupies a builder for its full duration. Extra jobs wait in a FIFO queue up to builders + 3. There are no speedups, no purchases. Research and heroes can give a modest speed bonus (max 25%).

## Building rules
- A building has levels 1..maxLevel. Level cap per building is `<= TH level` except Grand Coop.
- `maxCount` per type, often tied to TH level (e.g. farms: 2/3/4/6/8 at TH1/3/5/7/9).
- Upgrading keeps the building operating at the old level until done (except Grand Coop, which blocks nothing).
- Demolish refunds 30% of cumulative cost. Moving is demolish + build (no free move).
- Cancel: refund 100% if progress under 10%, else 50%.

## Launch buildings (v1, 17 entries)
| id | role |
|---|---|
| town_hall | gates everything, territory, march slots, caps |
| house | population cap (pop used by troops and workers) |
| farm | food production |
| lumber_camp | wood production |
| pebble pit | stone production, on or next to rock/highland |
| mine | gold and chili peppers (chili peppers needs TH7+) |
| feed silo | raises caps for food/wood/stone/gold |
| barracks | trains infantry |
| archery_range | trains archers |
| stable | trains cavalry |
| siege_workshop | trains siege (TH6+) |
| nursing nest | heals wounded |
| trading_post | TH4, max 1; `traderCap` effect = how many traders it fields; trains the `trader` unit and holds the auto-trade settings (see `economy.md`) |
| market | TH5, max 1; unlocks the `marketTrade` command; `tradeLimit` effect = max amount given per trade (once per 600 ticks per resource) |
| academy | research (TH3+) |
| tavern | hero recruitment (TH2+) |
| lookout perch | defence and vision radius |
| wall | optional wall segments (TH4+), adds city HP |
| builders_hut | +1 builder each (TH3: 1 hut, TH4: 2, TH7: 3) |

## Adjacency bonuses (small, readable)
Farm next to farm +5% each (max +20%). Lumber camp next to forest cell +10% per adjacent forest (max +30%). Pebble Pit next to cliff/rock +10% per adjacent (max +30%). Shown in the placement ghost as small icons.

## Proximity bonus (nearby resources)
Resource buildings also gain a bonus for matching terrain within a few tiles, so they want to sit near their resource. Cells at hex distance 2 to `radius` count (distance 1 is the adjacency bonus above, the two stack); each cell gives `perCell` percent up to `max`. Rules live in `data/balance.json` `proximity` (schema in `src/sim/data/schema.ts`, code in `src/sim/city/proximity.ts`): twig yard near forest (radius 3, +3% per cell, max +24%), pebble pit near rock or cliff (+4%, max +24%), mine near rock or cliff (+3%, max +18%), farm near water (+2%, max +12%). It is added to the same sum as adjacency, research, clan and buffs (`production.ts`), so the production floor and season multiplier apply after it. UI: the placement hover text shows adjacency plus proximity, the building panel has a "Production bonus" section (adjacent, nearby cells, effective rate), and the resource tooltip in the top bar lists "Nearby resources".

## Floating gain labels
In the base scene (`src/render/scenes/base/gains.ts`) every producing building shows an icon plus "+N" above its roof roughly every 12 s of game time (staggered per building, skipped while that resource is at its storage cap). A returning march shows its carried resources above the Grand Coop. The label pops in, drifts up and fades (shorter drift with reduced motion). Render only; it reads `computeProduction(state).byBuilding` and `MarchReturned` events.

## Defence
City HP pool = Grand Coop HP + wall HP. Lookout Perches add archery damage to defenders in a raid. Garrison troops (units at home) defend automatically. See `bandits.md` for resolution.

## Meshes
Parametric recipes in `src/render/buildings/`; each building has per-level add-ons (extra storey at L5, banner at L10, etc.). All shapes fit one hex footprint. Construction shows a scaffold mesh with a progress ring.

## UI
Build menu (category tabs, locked entries show what unlocks them), ghost placement, building panel (level, production, upgrade cost/time, effects diff), queue bar on HUD with builder portraits.
