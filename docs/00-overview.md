# Overview

## One-liner
A returnable, single-player 4X in the style of Rise of Kingdoms and Northgard, with the tone of Thronefall, played as chickens. Build your farm (coops, silos, a Grand Coop), send marches of chicken troops to gather and fight, level hero chickens, befriend animal lords, and push back the humans (farms first, then feedlots, suburbs and cities) in a world that gets harder every season. Funny, not grim: pitchforks, eggs and pigs.

## Pillars
1. **The world is the opponent.** No PvP, no rival economy to out-race. Pressure comes from seasons, human escalation, lairs, events and regional bosses.
2. **Builders, not timers, are the constraint.** Everything takes time, but time cannot be bought. Builder slots, population and march slots are what you manage.
3. **Returnable.** Closing the game is fine. Offline catch-up is capped and deterministic (see `systems/time-and-sim.md`). Nothing is lost by being away except opportunity, and the world never kills a city while the game is closed.
4. **Readable at a glance.** Cartoon, cel-shaded, thick outlines, muted palette. Every important thing (ramps, nodes, lairs, enemies) reads from the default zoom.
5. **Data-driven.** Balance is editing JSON. A new building or troop needs no code change in most cases.
6. **Procedural everything.** Terrain, props, buildings, units, icons and sound effects are generated in code.

## Core loop
```
Gather (marches to nodes) -> Spend (build, recruit, research)
   -> Grow power (city level, troops, heroes) -> Push out (scout, clear camps/lairs, ally)
   -> Unlock regions / bosses -> bigger nodes and threats -> repeat, with the season turning
```

## Player-facing feature list
- **City:** hex-grid buildings with levels; Grand Coop level gates everything; 1 to 4 builder slots; walls and towers for defence.
- **Economy:** feed, twigs, pebbles, golden eggs (+ one rare resource, "chili peppers"). Troops eat food. Feed Silo caps.
- **Marches:** send a hero + troops to gather, scout, attack, rally, or garrison. Visible on the map, path along real terrain, ramps matter.
- **Military:** infantry / archers / cavalry / siege counter triangle, 3 tiers. Wounded recover in the nursing nest.
- **Heroes:** levels, talents, an active skill fired by a rage meter, equipment from loot.
- **World:** fog of war, scouting, depleting and respawning nodes, POIs (camps, lairs, ruins, villages, shrines), regions with danger levels and a boss that unlocks the next region.
- **Humans:** their outposts (farms in the early regions, then feedlots, suburbs and cities) grow and raid weak targets (including the player) if ignored.
- **Allies:** animal lords with reputation stages; allied lords join rallies and send requests.
- **Seasons:** spring, summer, autumn, winter. Winter slows gathering, raises food upkeep, emboldens humans.
- **Replayability:** seeded maps, start types, clan bonuses, no persistent power creep.

## Out of scope (v1)
Multiplayer, accounts, servers, monetisation, real-time PvP, user-made content tools, localisation beyond English (strings are still externalised).

## Win and lose
- **Win ("Reign"):** defeat the final regional boss AND reach City level 25 (names provisional). Play continues in sandbox after.
- **Lose:** the capital falls (Grand Coop HP to 0 after a siege while the player is present and a raid succeeds against an undefended city). Because the game is returnable, the world only attacks the city with warning (see `systems/bandits.md`). Otherwise there is no fail state, only setbacks.
Both are provisional pending `06-open-questions.md` Q4.
