# Economy

## Resources
feed, twigs, pebbles, golden eggs, chili peppers (rare). Stored in the city up to cap; surplus from marches is lost (UI warns before overflow). Cap = base + sum(feed silo effects). Base caps 1000 each, chili peppers 100.

## Production
Per tick per building: `perTick[level] * (1 + adjacency + proximity + research + clan + buffs) * season` (proximity: see `city.md`). Base values in `data/buildings.json` (about 10 to 60 units per minute per building at low levels). Fractional production accumulates in an integer fixed-point accumulator (units x 1000) to stay deterministic.

## Upkeep
- Troops eat food: `sum(troop.upkeepFood * count)` per tick, wounded eat half, marching troops eat from the carried supply first, else from city stock.
- If food reaches 0: **starvation** for each 600 ticks: 2% of troops (rounded up, min 1 per pool) desert; heroes are never lost; warning event at 20% of cap and at 0.
- Gold: pays nothing recurring in v1. Gold is for hero recruitment, research, trade and tier-2+ troops.
- Population: housing caps total troops + workers; `workers = buildings*1` (D37), house popCap 16 to 220 by level, Grand Coop 20 + 4 per level. Training blocked at cap.

## Gathering
Gathering is done only by marches (see `marches-and-nav.md`). City buildings produce the steady base; marches are the burst and rare supply. Early game: farms/twig yards carry you; mid game: nodes at distance give much better yield and drive map expansion.

## Trade
Market building (TH5): exchange resources at a fixed 3:2 ratio (loses 33%) once per 600 ticks per resource, daily limit rises with level. Allied lords offer better ratios (see `allies.md`).

## Traders and auto-trade (D37)
The Egg Trading Post (TH4, one per city) trains `trader` units (role `trader`: they never march, fight or defend, eat food and use 1 housing). Every `balance.traders.intervalTicks` (300) the traders compare the stock of food, wood, stone and gold with the target mix chosen in the Egg Trading Post panel (one slider per resource, percent weights, even 25/25/25/25 by default, plus an on/off switch). Surplus resources are swapped for the short ones with the best non-hostile lord (`tradeRatioPm`: wary 1:1, friendly up to 1.48, allied 1.5, clan steps and likes included) minus a 10% commission (`traders.commission`). One trip moves at most `traders x loadPerTrader` (60) units and never overfills storage. Code: `src/sim/systems/traders.ts` (`planTrade`, `tickTraders`, command `setTrade`), called from `tickEconomy`; state `city.trade`. The Market keeps its manual 3:2 trade.

## Seasonal modifiers
See `seasons.md`. Gather and production are multiplied by season factors; food upkeep multiplier rises in winter.

## Starting values (Normal)
food 600, wood 600, stone 300, gold 150, chili peppers 0. Passive baseline income (before any building) of 0 so early decisions matter.

## Balance targets
- First 10 minutes: Grand Coop 2, 2 farms, 1 twig yard, house, feed silo, first gather march.
- Income rises about 3x between TH3 and TH5, 10x by TH10 (tracked by the balance bot).
- Price growth 1.5x per level, income growth per level about 1.35x, so upgrades slow down and push the player to expand to nodes.
