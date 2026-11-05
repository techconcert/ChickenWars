# 11. Building art QA report (independent review)

Reviewer: QA (Opus). Date: 2026-10-25. Scope: all 19 building generators in `src/render/meshes/buildings/*.ts`,
judged against `docs/10-building-art-brief.md` (sections 1, 3 and the section 4 checklist).

Method: own dev server (port 5177). Gallery views `buildings-a/b/c`, `buildings`, `halls`, `scaffold`, `close`.
For a fair stage-by-stage comparison every building was also rendered in an overlay
(same cel/outline meshes from `buildBuildingMesh`, pitch 38 degrees, fov 30, one viewport per stage). Back
views (yaw 180 degrees) at stage 4, damaged variants, and the live game (`/?demo=1&new=1`, levels set through
`window.__game.client.getState()`) with selection were checked too. Geometry was measured in the page via
`buildBuildingGeometry` (triangles = position count / 3, bounding box, NaN scan). Screenshots are in
`docs/screenshots/buildings-qa-*.jpg`.

## Overall verdict

**Big step forward, but not yet shippable. MUST-FIX items remain.** The new set clearly reads as "chicken farm":
combs, eggs, nests, the hen-faced Grand Coop, the pig-faced Pigsty, the owl tower, the hard-hat shed and the silo
all have personality, and they sit well next to the units. The Grand Coop, Pigsty, Owl Academy, Feed Silo,
Contraption Barn and Nursing Nest are good. There are no console errors and no NaN vertices, and selection and
outlines work in game.

Three things still fall short of the brief:
1. **Stage progression is broken in places.** Lookout Perch S1 and S2 look the same. Mine S0/S1, Picket Fence
   S1/S2, Market S0/S1 and Worm Tavern S1 to S3 barely change. Trading Post S1 is lower than S0.
2. **Triangle budget.** 7 of 19 buildings are over 1500 at stage 4. The stage-4 average is **1443** (target
   1100). The hall is at 1800 at S5 with zero headroom.
3. **Some buildings are still "a big flat roof".** The Worm Tavern and, to a lesser degree, the Chicken Coop
   and Rooster Barracks are mostly one roof rectangle. Several stage-0 models (Pigsty, Contraption Barn,
   Worm Tavern) are the same small yellow-thatch box at default zoom.

Also, `damage()` debris is misplaced for flat and low buildings (it floats or is buried).

## Measurements (triangles, excluding outline hull; top = bbox max y incl. flags/smoke)

| Building | S0 | S1 | S2 | S3 | S4 | S5 | Notes |
|---|---|---|---|---|---|---|---|
| hall (Grand Coop) | 565 / 1.33 | 953 / 1.51 | 1068 / 1.52 | 1640 / 1.91 | 1728 / 2.05 | 1800 / 1.93 | S5 exactly at the 1800 cap; S5 lower than S4; x reaches 0.96 (> 0.92) |
| house (Chicken Coop) | 364 / 0.71 | 644 / 0.94 | 780 / 1.15 | 1136 / 1.24 | 1484 / 1.46 | | ok |
| farm (Corn Field) | 188 / 0.27 | 512 / 0.27 | 916 / 0.70 | 1218 / 1.00 | **1647** / 1.20 | | over budget; S0 = S1 height |
| lumber (Twig Yard) | 356 / 0.36 | 600 / 0.65 | 944 / 0.85 | 1300 / 1.03 | **1549** / 1.26 | | over budget; every stage 0.1 to 0.14 under target height |
| quarry (Pebble Pit) | 348 / 0.42 | 488 / 0.86 | 868 / 0.96 | 1196 / 1.11 | **1545** / 1.24 | | over budget |
| mine (Golden Roost) | 430 / 0.45 | 540 / 0.55 | 940 / 0.80 | 1236 / 1.06 | **1657** / 1.24 | | over budget |
| storehouse (Feed Silo) | 366 / 0.65 | 662 / 0.73 | 862 / 0.95 | 1376 / 1.14 | **1609** / 1.36 | | over budget |
| barracks | 448 / 0.68 | 937 / 0.88 | 1197 / 1.10 | 1453 / 1.22 | 1469 / 1.32 | | S3 to S4 only +16 tris |
| archery (Egg Toss) | 252 / 0.58 | 664 / 0.74 | 908 / 0.87 | 1236 / 1.06 | 1409 / 1.17 | | heights 0.1 under target |
| stable (Pigsty) | 248 / 0.52 | 720 / 0.77 | 836 / 0.98 | 1108 / 1.08 | 1473 / 1.39 | | ok |
| workshop (Contraption Barn) | 336 / 0.58 | 664 / 0.81 | 896 / 1.40 | 1048 / 1.50 | 1453 / 1.52 | | S2+ top is smoke |
| infirmary (Nursing Nest) | 384 / 0.67 | 620 / 0.81 | 950 / 1.07 | 1198 / 1.17 | 1391 / 1.46 | | ok |
| academy (Owl Academy) | 284 / 0.93 | 540 / 1.09 | 794 / 1.25 | 1178 / 1.39 | 1435 / 1.55 | | ok |
| tavern (Worm Tavern) | 352 / 0.67 | 500 / 0.83 | 768 / 1.17 | 1092 / 1.27 | 1440 / 1.33 | | ok numerically, weak visually |
| tower (Lookout Perch) | 315 / 0.96 | 453 / 1.29 | 679 / 1.37 | **630** / 1.42 | 1007 / 1.67 | | S3 has fewer tris than S2; S2/S3 heights barely move |
| wall (Picket Fence) | 264 / 0.35 | 532 / 0.54 | 740 / 0.67 | **612** / 0.78 | 861 / 0.94 | | S3 has fewer tris than S2; cap 900 ok |
| builders | 988 / 0.63 | | | | | | ok |
| market (Egg Market) | 344 / 0.60 | 564 / 0.60 | 1116 / 0.91 | 1430 / 1.15 | **1747** / 1.32 | | worst offender; S0 = S1 height |
| tradingpost | 328 / 0.69 | 452 / **0.66** | 868 / 1.02 | 1140 / 1.16 | **1533** / 1.35 | | S1 lower than S0 |

- Stage-4 average over 19 buildings (hall at S4, builders at S0) = **1443** (target <= 1100).
- No NaN or Infinity in any position buffer. No console errors in the gallery or the game.
- Footprint: most S4 models reach |x| 0.76 to 0.81 (barracks, archery, stable, workshop, infirmary, tavern,
  storehouse, mine), mostly banners and props. That is still inside the hex inradius (0.866), so there is no
  visible overlap in town, but it breaks the 0.7 envelope.

## Scores (A = appeal 1-5, P = progression versus the previous stage 1-5)

| Building | S0 | S1 | S2 | S3 | S4 | S5 |
|---|---|---|---|---|---|---|
| Grand Coop (hall) | A4 | A4 P4 | A4 P5 | A4 P4 | A4 P4 | A4 P3 |
| Chicken Coop (house) | A3 | A3 P4 | A3 P3 | A3 P4 | A3 P3 | |
| Corn Field (farm) | A2 | A2 P3 | A3 P4 | A3 P4 | A4 P4 | |
| Twig Yard (lumber) | A2 | A2 P4 | A3 P4 | A3 P3 | A3 P3 | |
| Pebble Pit (quarry) | A2 | A2 P3 | A3 P4 | A3 P3 | A3 P3 | |
| Golden Roost (mine) | A3 | A3 **P1** | A3 P3 | A4 P4 | A4 P3 | |
| Feed Silo (storehouse) | A3 | A3 P3 | A4 P4 | A4 P4 | A4 P4 | |
| Rooster Barracks | A3 | A3 P4 | A3 P4 | A3 P3 | A3 P2 | |
| Egg Toss Range (archery) | A3 | A3 P5 | A3 P3 | A3 P4 | A3 P2 | |
| Pigsty (stable) | A2 | A4 P5 | A4 P3 | A4 P4 | A5 P4 | |
| Contraption Barn (workshop) | A2 | A4 P5 | A4 P4 | A3 P3 | A4 P3 | |
| Nursing Nest (infirmary) | A3 | A4 P5 | A4 P4 | A3 P2 | A4 P3 | |
| Owl Academy (academy) | A3 | A3 P3 | A4 P4 | A5 P5 | A5 P3 | |
| Worm Tavern (tavern) | A2 | A2 P3 | A2 **P2** | A2 **P2** | A3 P2 | |
| Lookout Perch (tower) | A3 | A3 P4 | A2 **P1** | A3 P3 | A4 P3 | |
| Picket Fence (wall) | A3 | A3 P4 | A3 **P1** | A3 P3 | A2 P3 | |
| Builder Hen's Shed | A4 | | | | | |
| Egg Market (market) | A2 | A2 **P2** | A3 P4 | A4 P4 | A4 P3 | |
| Egg Trading Post | A3 | A3 **P2** | A3 P4 | A3 P3 | A3 P2 | |

Checklist summary: 4.1 readability partial (stage-0 duplicates, the orange front-gable trio). 4.2 style match
mostly yes. 4.3 progression **fails** for tower, mine, wall, market, tradingpost and tavern. 4.4 hygiene mostly
ok, except damage debris and the barracks windows. 4.5 budget **fails**.

## Defects, prioritized

### MUST-FIX

1. **Lookout Perch, S1 to S2: no visible change.** `platY` is 0.62 at both stages. The S2 cabin hides under a
   cone the same size as the S1 umbrella roof, and S2 has no ladder (the ladder is drawn only at S1 and S3+). S3
   ends up with fewer triangles than S2 (630 vs 679).
   *Fix:* make `platY` = [0, 0.62, 0.78, 0.9, 0.95]. Draw the ladder at S2. Make the cabin visible below the eave
   (cone radius `cr + 0.06` instead of `+ 0.12`, cabin h 0.28). Give S2 four thicker legs (r 0.055) with a
   cross-brace. Keep S3 >= S2 in parts. File: `support.ts` (`tower`).
2. **Worm Tavern, S1 to S4: same silhouette, roof-only read.** The ridge runs along X, so a flat orange roof is
   about 65 percent of the view. There is no comb, sign or motif on the roof, and the worm sign is tiny. The S4
   apple annex sits low at the front right and reads as a red blob.
   *Fix:*
   - Add a front cross-gable or dormer (`softGable` with `rotY: PI/2`, about 0.4 wide) that carries the lit
     windows.
   - Scale the hanging worm sign 1.6x and hang it from that gable.
   - Make the chimney visible from S1.
   - At S4 move the apple to the back right (0.45, 0, -0.42) at r 0.3, so that it rises above the ridge as
     the brief intends, with the worm arcing over the roof.

   File: `support.ts` (`tavern`).
3. **Triangle budget is exceeded.** Over 1500 at S4: market 1747, mine 1657, farm 1647, storehouse 1609, lumber
   1549, quarry 1545, tradingpost 1533. The average is 1443 (target 1100). The hall is at 1728 at S4 and exactly
   1800 at S5.
   *Fix:*
   - Use detail-0 spheres for every egg with r < 0.05, pebbles and corn cobs.
   - Use seg 6 instead of 8 to 10 on small cylinders (stools, tables, posts, wheels under r 0.08).
   - Cap picket fences at one rail plus pickets every 0.14.
   - Drop the inner plates hidden under nests.
   - Aim for <= 1300 on economy buildings.

   Files: `economy.ts`, `economyExtra.ts`, `economyBits.ts`, `hall.ts`.
4. **`damage()` debris is misplaced.**
   - Farm: `TOP_Y.farm[1]` = 0.55, but the real top is 0.27, so the boards float above the field.
   - Wall: the boards hover above the pickets.
   - House S2 and Tavern S3: both boards are inside the walls or roof (`lowY` = 0.55 is inside a 0.75 wall),
     so only smoke shows.

   *Fix:*
   - Derive the debris y from the built geometry: call `b.build()` once, read `boundingBox.max.y`, then add
     the debris; or fix `TOP_Y` to the measured values.
   - Put the first board at about `top - 0.15` on the roof front (z 0.15 to 0.25), not at the centre.
   - For flat meshes (farm, quarry, market, wall) put the debris on the ground in front (y 0.03 to 0.06).

   File: `index.ts`.
5. **Stage-0 duplicates at default zoom.** Pigsty S0, Contraption Barn S0 and Worm Tavern S0 (and nearly Chicken
   Coop S0) are the same small yellow-thatch rectangle (see `buildings-qa-gallery-b.jpg`, top row).
   *Fix:* lead each S0 with its family motif:
   - Pigsty: a pink pig-snout sign, plus mud and a pink trough on the front.
   - Contraption Barn: an upright big cog (r 0.2) beside the bench, facing +Z.
   - Worm Tavern: a front-gable thatch with a barrel sign.
   - Chicken Coop: turn the ridge to a front gable so the pop-hole triangle shows.

   Files: `militaryExtra.ts`, `support.ts`, `house.ts`.
6. **Golden Roost, S0 to S1: almost identical.** Only a lantern and two tiny nuggets are added, and the mound
   grows by about 0.05.
   *Fix:*
   - At S1 add a timber entrance portal with a gable hood and a gold egg sign above it.
   - Add 3 to 4 emissive gold "vein" lumps embedded in the mound face.
   - Add a second cart egg.
   - Raise the mound h to 0.6.

   File: `economy.ts` (`mine`).
7. **Egg Market S0/S1 and Trading Post S1 regress.** The market S0 and S1 are a big empty grey paving with one or
   two stalls at the same height (0.60). Trading Post S1 (0.66) is lower than S0 (0.69), because the parasol is
   taller than the wagon hood.
   *Fix:*
   - Market: shrink the S0 paving to r 0.5; add an egg-basket pyramid and a small `eggSign` at S0; add a centre
     egg crate stack at S1 (top >= 0.75).
   - Trading Post: raise the S1 hood (hood centre y + 0.08) or keep the parasol on the wagon, so that S1 >= 0.8.

   File: `economyExtra.ts`.
8. **Rooster Barracks S2 to S4: windows clipped.** The upper-storey round windows are cut in half by the
   lower-storey roof skirt, and at S4 they disappear. The double roof also reads like a pagoda.
   *Fix:* raise the upper windows above the lower eave line (y >= lower eave + 0.08), or narrow the lower roof
   to a 0.12 eave band. At S4 make the mascot face readable: scale 1.6 on a front shield board that sits proud
   of the lower roof, not tucked under it. File: `military.ts` (`barracks`).
9. **Gallows read and crane occlusion.** The Pebble Pit pulley (S1 to S3: two posts plus a flat crossbeam plus a
   hanging rope) and the Contraption Barn crane (S3 and S4) read as gallows. That is off-tone for a cartoony farm.
   The barn crane also stands in front of the door and the big gear, hiding the S2 signature.
   *Fix:*
   - Quarry: an A-frame tripod with a visible pulley wheel (cyl r 0.06, `rotX: PI/2`) at the apex and a fat
     bucket of pebbles.
   - Workshop: move the crane to the back right (0.5, 0, -0.45) as a single mast with a diagonal boom, and hang
     the bale beside the barn, not over the door.

   Files: `economy.ts` (`quarry`), `militaryExtra.ts` (`workshop`).
10. **Corn Field rows read as flat green planks or benches.** The rows are solid same-colour slabs, which look
    like lumber, not corn, at S0 and S1. S0 and S1 are the same height (0.27).
    *Fix:* build rows from rounded bumps (2 to 3 lying cylinders per row with jitter 0.07, alternating
    `cornLeaf` and `sage`), and add small tassel cones along the top every 0.15. Make S1 rows h 0.2 so the top
    is >= 0.4 with the fence. File: `economyBits.ts` (`lowRow`), `economy.ts` (`farm`).
11. **Egg Toss Range S1/S2: roof appears to float, and the S4 slingshot is invisible.** The front posts (x ±0.405,
    z 0.1) are hidden behind the targets, and the slingshot at (0.6, -0.3) is behind the shed roof from the game
    camera, so S3 to S4 only adds a gold ridge and a banner.
    *Fix:* move the front posts to x ±0.5 and the targets to z 0.5. Put the slingshot at the front right
    (0.55, 0, 0.35), facing -X towards the targets. File: `military.ts` (`archery`).
12. **Picket Fence, S1 to S2: no visible change.** Only the egg finials and footing height change. At S4 the
    perch roof is a flat red box that hides the guard chicken.
    *Fix:*
    - At S2 make the centre gate an arch: 2 posts h 0.55 plus a curved top bar, with the egg finials scaled to
      r 0.07.
    - At S4 turn the mini roof to a front gable (`rotY: PI/2`, len 0.3, wid 0.4) and set the chicken 0.08 in
      front of it.
    - Keep S3 >= S2 in detail (612 < 740 now).

    File: `support.ts` (`wall`).
13. **Builder Hen's Shed: the mini chicken's hard hat swallows its head.** The hat hides the head, so the chicken
    reads as a tipped-over yellow blob. *Fix:* hat hemisphere r 0.03 at the head top (y + 0.17 * s), body
    rotY towards +Z, so that the eyes and beak show. File: `house.ts` (`builders`).

### NICE-TO-HAVE

14. **The orange front-gable trio looks alike.** Egg Toss Range, Pigsty and Worm Tavern share `PAL.roofOrange`;
    archery and stable also share the front-gable shape, so they look alike in the same gallery row. *Fix:* give
    archery a lean-to (`shed`) roof in `FARM.mustard`, and record the change in `05-decisions.md`.
    Files: `index.ts` (`ROOF_DEFAULT`), `military.ts`.
15. **Brown cluster.** Twig Yard, Pebble Pit and Golden Roost use the same brown front-gable shed (`0x9a5a38` on
    `timberLight`), and the Twig Yard is almost all brown.
    *Fix:*
    - Twig Yard: a `FARM.sage` door and a hay-coloured twine drawn as horizontal bands (right now they render
      as vertical yellow sticks).
    - Quarry: shed walls `stoneLight`.
    - Mine: a hut with a dome roof instead of a gable.

    File: `economy.ts`.
16. **Thin poles render as black lines.** Banner and flag poles (r 0.022), tower rail posts (0.022) and the
    Chicken Coop wire-run frames lose their colour at default zoom. *Fix:* banner pole r 0.03; skip the
    outline-thin parts or use `timberLight`. Files: `parts.ts` (`banner`, `flag`), `support.ts`.
17. **Chicken Coop: the roof is a flat red rectangle.** The ridge runs along X, so the roof reads as a slab,
    S1 to S2 is modest (the loft is hidden under the roof), and the S3 wire run renders as solid grey panels.
    *Fix:*
    - Make the comb on the ridge bigger (s 1.4).
    - Put a lit dormer on the front slope at S2.
    - Draw the wire as a lighter `FARM.wire` panel with vertical timber battens every 0.15.

    File: `house.ts`.
18. **Golden Roost S4: the giant golden egg is half hidden** behind the ladder on the right. *Fix:* move the
    pedestal to the front left (-0.3, 0, 0.45). File: `economy.ts`.
19. **Grand Coop S5 is only a modest step over S4,** and its top is lower (1.93 vs 2.05). *Fix:*
    - Golden egg r 0.13 on the cupola.
    - Gold comb on each nest-tower dome.
    - A gold band on the wing eaves.
    - Keep S5 >= S4 height.

    Also trim the hall wing roofs so that x <= 0.92. File: `hall.ts`.
20. **Nursing Nest S3: the sun-room annex is hidden** behind the cottage at (-0.5, 0, 0). *Fix:* move it to the
    front left (-0.5, 0, 0.25). File: `supportExtra.ts`.
21. **Trading Post S4: the mustard second wagon is hidden** behind the main wagon. *Fix:* put it at the front
    right (0.45, 0, 0.35), rotated 0.5. File: `economyExtra.ts`.
22. **Footprint creep.** Banners and props reach |x| 0.79 to 0.81 on 8 buildings at S4. *Fix:* clamp banner x to
    ±0.62. Files: per generator.
23. **Duplicated part helpers.** `hall.ts` (`cComb`, `cFence`, `cNest`, `cVane`, `cDome`), `economyBits.ts`
    (`low*`) and `militaryExtra.ts` (`lowComb`, `lowFence`, `nestLow`, `bale`) re-implement parts that
    `parts.ts` already has. The result is inconsistent fences (white pickets on the hall, timber rails on the
    barracks, stable and tavern, stone-grey on the farm) and three comb styles. *Fix:* consolidate into
    `parts.ts`/`partsProps.ts` and use one `picketFence`, `comb` and `nest`.
24. **Scaffold placeholder** is still a plain cream cube inside the frame. *Fix:* a `roundBale` plus an egg on
    the platform, as in brief 3.19. File: `scaffold.ts`.
25. **Owl Academy:** the ridge bell frame reads as a dark blob at default zoom. *Fix:* bell r 0.06 in gold with
    a `c.roof` hip cap, and posts in `timberLight`. File: `support.ts` (`academy`).

## What works well (keep)
- **Grand Coop:** the hen face (lit eye windows, beak awning, comb) reads at every stage and in game. The
  S3 to S4 towers and fence are a clear step up.
- **Pigsty:** the pig face, piglets in the mud and the pig weathervane are the most charming set.
- **Owl Academy:** the S3 owl tower with ear tufts, and the S4 mortarboard, are a great landmark.
- **Feed Silo:** the fat silo with the comb crown, and its twin-silo growth, give clean progression.
- **Contraption Barn:** the gambrel red barn with the gear and smoking chimney. **Nursing Nest:** the warm lit
  windows and the nest.
- **Builder Hen's Shed:** the hard-hat roof with eyes under the brim.
- Palette is muted and consistent with the units. Team colour appears only on banners and awnings. Selection
  ring, outlines and the damaged smoke work in the live game.

## Re-check after fixes (second pass, 2026-10-25)

Method: same as above (own dev server, port 5181). Every building at levels 1/3/5/7/10 (hall 1/5/10/15/20/25)
rendered in a per-stage overlay at pitch 38 degrees, fov 30, plus back views (yaw 180), damaged variants, the
gallery views `buildings-a/b/c` and the live game (`/?demo=1&new=1`, levels raised in memory, paused). Geometry
measured with `buildBuildingGeometry` (triangles, bbox, NaN scan); capital and POI markers (which share the parts)
were also scanned for NaN. New screenshots: `docs/screenshots/buildings-recheck-*.jpg`.

### What changed in this pass
- **One fence, comb, nest style (item 23).** The private copies are gone: `hall.ts` `cComb/cFence/cNest/cVane/cDome`,
  `economyBits.ts` `lowFence/lowComb/lowNest/lowBale/lowEgg/lowChicken`, `militaryExtra.ts`
  `lowComb/lowFence/nestLow/bale/bale2`. The shared parts take cheap options instead: `comb(.., { detail: 0 })`
  (`LOW_COMB`), `picketFence(.., { gap, rails, posts })` (`LOW_FENCE`), new `picketRun` (shared corner posts),
  `nest(.., lite)`, `hayBale(.., lite)`, `roundBale(.., lite)`, `miniChicken(.., lite)`,
  `weathervaneRooster(.., lite)`, `domeRoof(.., { rings, lipCol })`, `egg(.., detail)`. Every building now uses the
  same white pointed-picket fence (prism pickets, 16 tris each) and the same red three-lobed comb. New `pyramid`
  part replaces small `b.cone` calls where it matters (a three.js cone of n segments costs 3n triangles, n of them
  degenerate; the pyramid costs 2n - 2).
- **Twig Yard roof (task).** The flat lean-to slab is replaced by a steep roof of round logs (`logRoof`): three
  stepped logs per slope in alternating roof colours, a ridge log and, from stage 2, crossed log "antlers" over both
  gable peaks. Walls are a tapered log cabin. The log bundles now show their log ends to the camera and the twine
  straps are triangular bands hugging the pile (they used to be big yellow blocks). Also fixed: `bundle` placed its
  pile off-centre (`logPile` grows from its start point).
- **Budget headroom.** Golden Roost 1479 -> 1327 (lite golden nest, tapered hut), Corn Field 1485 -> 1369 (fence run
  with shared corners, pyramid tassels and leaves), Feed Silo 1493 -> 1361 (3-ring domes, fewer silo bands).
  Hall S5 1776 -> 1718.
- **Item 16:** banner, flag and hall pennant poles are r 0.027 to 0.032 in `timber`.
- **Item 17:** coop comb 1.4 at every stage; the wire run is a pale panel with 0.035 timber battens about every
  0.2 and shared corner posts.
- **Item 20:** from stage 3 the Nursing Nest leaf sign stands front centre, so the sun-room annex is visible.
- **Item 22:** footprint |x| <= 0.8 everywhere except the hall (dais, 0.92 envelope) and the wall (0.87 by design).
  Fixed: Nursing Nest sign (0.89), Worm Tavern apple annex and banner (0.91, the apple also moved forward so it is
  visible), Egg Toss loft (0.81) and basket (z 0.84), Picket Fence S3 tower flags (0.95).
- **Item 24:** scaffold posts are round, the hay cube is a round bale plus an egg on the planks, and the rising
  footing is stone base + cream wall course with a door gap + timber plate instead of a cream cube.
- **Barracks (item 8 regression):** the upper-storey windows were still half hidden by the lower roof band from the
  game camera; the band is shallower, the upper eave narrower and the windows sit higher.
- Already fixed before this pass (verified in code and screenshots): 13 (builder hen hat), 14 (mustard lean-to
  archery), 15 (sage door, slate quarry, ochre mine with a dome hut), 18 (giant egg front left), 19 (gilded S5,
  S5 >= S4 height), 21 (second wagon front right), 25 (gold bell, roof cap, light posts).

### Final triangle table (excluding outline hull; top = bbox max y)

| Building | S0 | S1 | S2 | S3 | S4 | S5 | max abs x at S4 |
|---|---|---|---|---|---|---|---|
| hall | 533 / 1.33 | 921 / 1.51 | 1014 / 1.52 | 1558 / 1.91 | 1602 / 2.05 | 1718 / 2.07 | 0.92 (dais 1.0) |
| house | 344 / 0.75 | 608 / 1.05 | 744 / 1.23 | 1124 / 1.33 | 1436 / 1.50 | | 0.76 |
| farm | 400 / 0.30 | 644 / 0.40 | 854 / 0.70 | 1132 / 1.00 | 1369 / 1.20 | | 0.73 |
| lumber | 532 / 0.50 | 660 / 0.78 | 1012 / 0.92 | 1244 / 1.05 | 1441 / 1.26 | | 0.74 |
| quarry | 348 / 0.42 | 544 / 0.86 | 884 / 0.96 | 1180 / 1.10 | 1449 / 1.24 | | 0.73 |
| mine | 430 / 0.46 | 648 / 0.69 | 926 / 0.83 | 1146 / 1.08 | 1327 / 1.24 | | 0.72 |
| storehouse | 314 / 0.65 | 546 / 0.73 | 726 / 0.95 | 1128 / 1.14 | 1361 / 1.35 | | 0.75 |
| barracks | 448 / 0.68 | 937 / 0.88 | 1197 / 1.12 | 1413 / 1.22 | 1441 / 1.32 | | 0.79 |
| archery | 288 / 0.58 | 564 / 0.68 | 904 / 0.80 | 1220 / 1.00 | 1457 / 1.10 | | 0.78 |
| stable | 312 / 0.52 | 644 / 0.77 | 760 / 0.98 | 1032 / 1.08 | 1397 / 1.39 | | 0.79 |
| workshop | 300 / 0.58 | 664 / 0.81 | 896 / 1.40 | 1040 / 1.50 | 1445 / 1.52 | | 0.79 |
| infirmary | 384 / 0.67 | 620 / 0.81 | 950 / 1.07 | 1186 / 1.17 | 1379 / 1.46 | | 0.79 |
| academy | 284 / 0.95 | 540 / 1.11 | 794 / 1.25 | 1138 / 1.39 | 1383 / 1.55 | | 0.77 |
| tavern | 456 / 0.71 | 768 / 0.93 | 864 / 1.31 | 1084 / 1.41 | 1452 / 1.47 | | 0.79 |
| tower | 315 / 0.96 | 453 / 1.29 | 827 / 1.59 | 951 / 1.75 | 1251 / 1.86 | | 0.61 |
| wall | 264 / 0.35 | 384 / 0.51 | 488 / 1.00 | 593 / 1.08 | 764 / 1.27 | | 0.87 (spans the edge) |
| builders | 976 / 0.63 | | | | | | 0.67 |
| market | 368 / 0.60 | 632 / 0.77 | 1000 / 0.91 | 1289 / 1.15 | 1450 / 1.32 | | 0.73 |
| tradingpost | 328 / 0.69 | 512 / 0.80 | 776 / 1.02 | 1052 / 1.16 | 1369 / 1.35 | | 0.75 |

- Every building is under 1500 at stage 4 (highest: archery 1457), the hall is 1718 at S5 (cap 1800), the wall
  764 (cap 900). Stage-4 average (hall at S4, builders at S0): **1355** (was 1443; the 1100 target is still not met).
- Triangles and height grow at every stage for every building. No NaN or Infinity in any building or marker
  position buffer. No console errors in the gallery.

### Remaining known issues (honest list)
- The 1100 stage-4 average from the brief is not reached; reaching it needs a second detail pass on every
  building (most sit at 1380 to 1460).
- Egg Toss Range is still mostly one big mustard roof plane from the game camera (the painted target helps); the
  S4 banner sits behind the roof. Not changed in this pass.
- Storehouse S0 to S1 and Twig Yard S2 to S3 are modest steps (props, plinth, window) rather than new volumes.
- Corn Field rows read as green lumps with brown spikes until stage 2, when the cobs turn yellow.
- Picket Fence S4: the guard hen is small in front of the perch roof.
- Doors and round windows still have three cheap variants (`cDoor`/`cWin` in `hall.ts`, `lowDoor`/`porthole` in
  `economyBits.ts`, `doorY` in `militaryExtra.ts`); they look alike, so they were left out of this consolidation.
- Live game: checked the town at stages 2 to 4 with levels raised in memory (the demo restarts itself, so only
  some buildings were framed: hall, houses, farms, storehouse, barracks, tavern, Twig Yard). Quarry, market and
  trading post were not seen in the live town in this pass, only in the gallery and overlay.
- `docs/05-decisions.md` D46 still says each family keeps cheap local props; that is now only true for doors,
  windows and family-specific props (not edited here, outside this pass's files).
