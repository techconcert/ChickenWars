# Combat

Auto-resolved, round-based, integer maths, deterministic given the inputs and `hash(seed, 'combat', tick, battleId)`.

## Inputs
Two sides. Each: hero (stats, skill, rage), stacks `[{troopId, count}]`, modifiers (terrain, season, research, defence structures, ally support).

## Round (max 12 rounds; a round = 1 simulated "exchange")
1. Each stack picks a target stack on the other side: counter-class first, else the highest-count stack. Ties resolved by sorted troop id.
2. Damage per stack: `count * atk * (1 + hero.atkBonus + mods) * counterMult * terrainMult / (1 + targetDef/ (targetDef + K))` with `K=100`; integer floor. Archers act first on round 1 (volley).
3. Casualties = `floor(damage / targetHp)` capped by stack size. HP carry-over per stack stored as remainder.
4. Rage: each side gains `+20` per round plus `+casualtyShare*40`; at 100 the hero skill fires immediately next round and rage resets (once per battle by default, twice for rank-up).
5. End when a side has 0 troops, or round 12 ends: the side with the greater remaining total "power" (sum count*(atk+def+hp/10)) wins; ties favour the defender.

## Modifiers
- Level advantage: attacking uphill (target on a higher terrace) -10% atk per level (max -20%); defending uphill +10% def per level.
- Season: winter -5% atk/def for non-cold-clan.
- Defence structures in city raids: lookout perches add archer-like damage to defender each round; walls absorb a fraction of attacker damage until wall HP is gone.
- Fortification: camp palisades add +25% def to defenders until siege units reduce it.

## Outputs
`BattleReport { winner, rounds[], casualtiesA, casualtiesB, woundedA, loot, heroXp, rageEvents }`. UI shows a summary card plus a 5 to 10 second procedural animation: two lines of unit figures, volley arrows, hit flashes, hero skill banner. The animation is driven only by the report (render concern).

## Loot
Camps drop resources by tier and an item roll. Lairs and bosses drop gear and chili peppers. Hero xp = sum enemy power / 20.

## Tests
Counter triangle ordering (A beats B beats C beats A at equal power), determinism, hero skill triggers, wall absorption, uphill modifiers, casualties never exceed stack sizes, wounded split.
