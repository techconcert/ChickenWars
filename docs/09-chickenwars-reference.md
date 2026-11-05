# ChickenWars_Test reference review

Reviewed on the reskin (D45): `/Users/mac/Development/Claude/ChickenWars_Test` (its README calls it **FarmSim**). This note records what is in it, what we reused now and what is parked for later. **Nothing from it is ported as code**; models were re-built in this project's own mesh builder in the same visual language.

## What it is
A technical demo of a living low-poly farm in raw WebGL2 (ES modules, no dependencies): 20 animal species in 20 fenced pens (chicken, duck, turkey, rabbit, goat, sheep, pig, cow, horse, llama, donkey, goose, alpaca, deer, ostrich, yak, buffalo, peacock, camel, capybara), up to 10,000 animals and 200 farmers, trucks that arrive and are loaded, day and night, cel shading with thick inked outlines.

## Design language (`DESIGN_LANGUAGE.md`) we adopted
- Round over boxy: animals are plump ellipsoids and tapered tubes, big heads, short stout legs, tiny dark square eyes; only beaks, combs, horns, hooves and tools are faceted.
- Hard cel bands (shade, mid, lit), warm lit and cool shade, no specular, matte and muted.
- Inverted-hull outlines, thicker for big things; small animals about 0.02 to 0.03 m, buildings 0.08, trees 0.10.
- Muted natural palette (meadow `679b4a`, roads and yards in tans).
Our `docs/03-art-direction.md` has a "ChickenWars characters" section that applies this to the unit models.

## Models reused now (re-built in `src/render/meshes/chickens.ts`)
| From the reference | Used for |
|---|---|
| Chicken (`rig.js` `chicken()`: egg body, round head, three-lobed comb, yellow beak, wing and tail pieces) | All chicken troops and heroes |
| Pig (`pig()`: pink body, snout, floppy ears, curly tail) | The mount of the Piglet Rider, Boar Knight and Hog Lancer cavalry |
| Farmers | The human enemy infantry (angry farmer, shotgun farmer) |
| Trucks (`trucks.js`: pickup, van, tanker) | Human vehicles (ATV, tractor now; pickup trucks and humvees later) |
| Farm buildings (barn, silo, well, farmhouse, storehouse, compost, vet shed) | The human farm markers on the world map; the coop and silo look |
| Pens and biomes (pond, desert, forest, riverbank...) | Inspiration for regions and decor |

## Concept notes for later (not implemented)
1. **Large-scale unit wars** (the user plans to port this later). The reference shows how to do thousands of units: struct-of-arrays typed arrays (DOTS style), one instanced draw per part type and LOD tier, a spatial hash rebuilt each tick for separation and steering, per-instance frustum culling, three distance tiers (near outlined body, far coarse mesh, blob), an adaptive triangle and draw-call budget, and simulation in a worker (`animalWorker.js`, `parallel.js`). A battle mode would need: a deterministic seeded sim (ours already is), unit rigs for all classes with near/far meshes, steering around obstacles, and an adapter from our `BattleReport` and troop counts to the instanced crowd. The current battle FX (`src/render/fx/battle.ts`) shows a handful of figures per side and can stay as the fallback.
2. **Species as units.** The 20 species suggest more chicken-world unit and ally ideas: duck (water scout), goose (guard), turkey (heavy siege), ostrich (fast cavalry), goat (climber), llama (spitter archer), capybara (healer). Allies (lords) could field their own species instead of reusing chicken troop defs.
3. **Needs-driven behaviour** (hunger, thirst, sleep, chores) could drive idle life in the base scene (chickens pecking around the coops). Cosmetic, not sim.
4. **Trucks on a schedule** map nicely to human raids and trade caravans arriving at the farm.

## Where things are
- Reference project: `ChickenWars_Test/src/render/rig.js` (models), `units.js` (instanced renderer), `lowpoly.js` (builders), `sim/*` (ECS sim), `PLAN.md` (architecture), `DESIGN_LANGUAGE.md`.
- This project: `src/render/meshes/chickens.ts` (unit models), `units.ts` (rigs, faction switch), `markers.ts` (human farm and city markers), `buildings/house.ts` (coop).

Screenshots of the result: `docs/screenshots/chickenwars-units.jpg` (chickens, pig riders, hay bale roller vs farmers, ATV, tractor), `chickenwars-human-outposts.jpg` (human farms, compounds, boss barn and city blocks), `chickenwars-farm.jpg` (the coop farm), `chickenwars-world.jpg` (a chicken march on the world map).
