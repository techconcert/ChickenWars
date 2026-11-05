# ChickenWars: handoff (project formerly called 4X_Test)

Written 2026-10-18 from the original planning chat. Read this first, then `prototypes/hex-island-poc/index.html`.

## 1. Vision

A single-player 4X-style exploration game in the spirit of Northgard and Rise of Kingdoms, with the tone of Thronefall.

**Keep:**
- A city-building side with upgrades
- Sending troops to gather resources from the overworld
- Fighting humans and other threats on the map
- Joining up with allied lords to explore or conquer larger areas, and scaling up over time

**Exclude:**
- Free-to-play monetisation (timers, speedups, gems, paywalls)
- Any requirement for an internet connection or a server
- PvP

**Feel:** exploratory, returnable single-player. The world itself is the threat (seasons, human escalation, lairs, events), not other players.

**Graphics:** cartoon, cel-shaded, with thick outlines, closer to Thronefall than Northgard. The reference style matches the earlier ChickenWars_Test project (cel bands, inverted-hull outlines, muted palette). See `reference/images/`.

## 2. Decisions so far

- **Camera and art direction:** 2.5D. A 3D scene with a narrow-FOV perspective camera at an isometric-style angle. Rotation is optional, in 90° snaps. This gives smooth zoom from city to world and makes seasonal lighting cheap.
- **Engine:** not decided. Godot 4 and Unity both work. The prototype is web-based (three.js) for speed of iteration, so the engine choice does not block the design.
- **No external art assets.** Everything is generated in code and shaders: terrain, cliffs, rocks, trees, lakes, grass and props. Hand-made assets may come later for buildings and units only.
- **Data-driven content:** buildings, troops, heroes and research are defined as data, not hard-coded. Balancing means editing numbers.
- **Deterministic simulation:** all timers are tick-based, not wall-clock based. Saves are local JSON.

## 3. Terrain approach (the prototype)

The core idea is that the hex grid is **logical data only**. The visible ground is a separate fine height field.

1. **Logic layer (hexes):** a two-level hex structure. A micro hex grid (about 34 cells across) is grouped into macro regions via jittered seeds with domain-warped nearest-seed assignment. Each region gets a biome and a terrace level. Level 0 is beach. Levels rise inland.
2. **Clean-up:** flat patches smaller than 4 connected hexes are merged into their surroundings. This prevents the little rock rings that appeared before.
3. **Height field:** a square grid (about 0.3 units per sample). Each sample is domain-warped with noise, then looked up in the hex grid to get its level. Per-level signed distance fields are computed, and height = sum over levels of `STEP * smoothstep(sdf / width)`.
   - Cliffs are steep (narrow width).
   - Ramps are wide soft capsules (about 2.5 to 4.5 units) placed across chosen region borders. The ramp connectivity comes from a union-find spanning tree over borders one level apart, so every plateau stays reachable.
4. **Ramp verification:** each ramp's centreline slope is measured, and ramps over 0.6 are widened (up to 5 passes).
5. **Colour:** biome colours blur across region borders, with low-frequency tonal patches. Steep slopes (normal.y below about 0.6) become rock with strata. Paths and ramps are dirt-coloured. Snow is blended on the top levels.
6. **Rocks:** marching-squares contours on each level's SDF give polylines. Rocks are placed along them in rows, sized by drop height, leaning back up the cliff, with bigger rocks at convex corners. Some stretches are left bare on purpose. Rocks skip ramps and lake shores.
7. **Trees and props:** placed by querying the height field (slope, distance to contour, ramp and lake masks). Forest density feathers into meadow.
8. **Lakes:** a basin at a local minimum, with a water surface and a soft shore.

Generation takes about 240 ms on the default seed (1337). Roughly 1.1M triangles including outline hulls.

## 4. Current status

**Working:**
- The overview reads as an organic island, with no rock rings and no visible hex edges
- Cliffs follow organic contours
- Ramps exist and can be flown to with "Go to next ramp". Stats show how many pass the slope check (8 of 9 on seed 1337)
- Controls: seed input and New island, toggles for rocks, raw cliffs, trees, hex overlay, colour by region, highlight ramps

**Known problems:**
- **Ramps are hard to read from above.** On a gentle slope the cel bands barely change, so a ramp looks like a flat dirt patch. Ideas: darker side banks, a few rocks lining the ramp edges, or a stronger slope tint.
- **One ramp on seed 1337 still exceeds the slope target** (0.68 vs. a 0.6 goal). It is reported in the stats line but not re-routed.
- **Square sea edge:** the water stops at a visible square when zoomed out. Needs a circular fade or a larger sea plane.
- **Soft cliff faces:** bare cliff stretches look blurry up close, because the height grid is coarse.
- **Thin plateaus:** a ramp can fail to reach the upper level where the top area is narrow.
- **Rare seed glitch:** once, the seed field appeared to switch to a random value on its own. It could not be reproduced, and no cause was found.
- **Frame rate:** not measured on real hardware.

## 5. Next steps (suggested order)

1. Make ramps readable: add side banks and rock edging, and strengthen the slope tint.
2. Fix the one over-steep ramp: re-route or widen it instead of only reporting it.
3. Fix the sea edge with a circular fade.
4. Measure frame rate on a real laptop, and decide whether to reduce the grid resolution.
5. Decide on the engine (Godot 4 or Unity), then port the terrain approach. The logic layer and the height-field rules carry over directly.
6. Build the game systems on top of the terrain: city, economy, marches, humans, heroes, allies. See section 6.

## 6. Systems still to design

- **City:** buildings with levels, builder slots as the real constraint (no speedups), a Grand Coop level that gates the rest.
- **Economy:** feed, twigs, pebbles, golden eggs (possibly one rare resource). Gathering uses marches to map nodes. Troops eat food. Seasonal modifiers.
- **Military:** infantry, archers, cavalry and siege in a counter triangle. Wounded troops go to an nursing nest and recover, rather than being lost for good.
- **Heroes:** levels, talent trees, an active skill that fires in battle, and loot-based equipment.
- **World:** fog of war, scouting, depleting and respawning resource nodes, points of interest (camps, lairs, ruins, villages, shrines), regions with danger levels and bosses that unlock the next region.
- **Humans:** camps grow over time and raid weak targets if ignored.
- **Allies:** reputation stages (hostile, wary, friendly, allied). Allied lords join rallies and ask for help.
- **Combat:** round-based auto-resolution from troop counts, counters and hero buffs. A hero skill fires when a rage meter fills.
- **Seasons:** a winter cycle that slows gathering, raises food upkeep and makes humans bolder.
- **Replayability:** seeded maps, start types (river, frozen north, islands), clan bonuses. No power creep that punishes a fresh start.

## 7. Files

```
ChickenWars/
  HANDOFF.md                         this file
  prototypes/hex-island-poc/
    index.html                       the terrain prototype (single file, three.js via CDN)
  reference/images/
    northgard-thronefall-ref-1.png   style and terrain reference
    rock-ring-issue-2.png            example of the rock-ring problem that was fixed
```

## 8. How to run the prototype

```bash
cd /Users/mac/Development/Claude/4X_Test/prototypes/hex-island-poc && python3 -m http.server 8765
```

Then open http://localhost:8765/. It needs internet access on first load, to fetch three.js from unpkg.

## 9. Process notes

- The prototype was written by a Sonnet subagent from a design brief, then reworked twice from feedback. Each round was checked in the browser pane.
- The original planning outline (vision, loop, systems, art direction, scenes) is in section 1 to 6 above. The chat that produced it is not kept in this folder.
