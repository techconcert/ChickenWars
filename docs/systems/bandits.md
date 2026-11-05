# Humans and threats

(File name kept for link stability; code ids still say `bandit_*`.) The enemy is **humans**: small farms in tier 1 to 3 regions, feedlots at tier 3, suburbs and cities at tier 4 and 5. Their troops are the `h_*` troop defs (angry farmers, shotgun farmers, ATV riders, animal control, hunters, pickup trucks, riot police, army snipers, armoured humvees).

## Camps
Each `bandit_camp` has `tier` (1..5), `troops` (stacks), `strength`, `growthRate`, `raidCooldown`. Strength grows by `growthRate` per game day up to `tierCap` (and is **reset to the base** when cleared; cleared camps respawn at a new nearby cell after 3 to 5 days at tier-1 strength so the map stays alive). Growth rate is multiplied by season (winter x1.5 boldness) and difficulty.

## Raids
- A camp may launch a raid when `strength >= raidThreshold`, its target is within `raidRange` cells, and the target is "weak": the player's city with total defence power below the camp's strength x 0.8, or an unguarded node/gather march (ambush).
- **Warning:** a `RaidWarning` event fires `RAID_WARNING_TICKS` (1200 = 2 min, +research up to 4 min) before arrival, showing the raiders' path and ETA. Auto-pause option.
- **Resolution on city:** defence = garrison troops + lookout perches + walls + heroes at home. Combat uses `combat.md` with city modifiers. If the city loses: raiders loot up to 20% of non-protected stock (feed silo protects 25% by level), some buildings are damaged (`damaged` flag, -50% output until repaired for cost), no building is destroyed and the capital cannot be lost in v1 **while the game is returnable** (D14). Heavy repeated defeats escalate a "city in peril" quest with help from allies.
- **Ambush on march:** marches have a small chance (by tier, danger and season) to meet humans at nodes in unguarded regions; battle auto-resolves.

## Difficulty
Easy: strength x0.8, raid warning x1.5. Normal: x1. Hard: strength x1.25, warning x0.75, raids start earlier.

## Lairs and bosses
Lairs: stronger camps with a miniboss hero and fixed loot table. Bosses: one per region, named, 2 phases (shows a pre-battle brief: counters recommended). Defeating them unlocks regions and gives chili peppers and gear. They never grow or respawn.

## Offline
No raids while closed (D12). Camps grow only to their tier cap while away.

## Tests
Growth caps, raid triggers only when conditions hold, warning lead time, offline suppression, resolution deterministic.
