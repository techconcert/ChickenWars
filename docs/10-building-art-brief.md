# 10. Building art brief (ChickenWars)

Owner: art director. Audience: a coder who has not seen the game. Scope: every building mesh in
`src/render/meshes/buildings/*.ts`, every visual stage (`levelStage`: stages 0..4, hall 0..5, builders 0 only).
Goal: buildings look like they belong next to the plump chickens in `src/render/meshes/chickens.ts`: chunky,
rounded, cartoony, farm-and-chicken themed, with a clear "this got bigger and better" step at every stage.

What the gallery shows today (`tools/gallery.html?view=buildings-a|b|c|halls`): thin-walled boxes under big flat
roofs. At the game camera (pitch about 38 degrees) the **roof is 60 to 70 percent of what the player sees**, the
front wall is a thin strip, and anything thinner than about 0.035 units turns into a black outline line. Most
buildings read as "generic medieval house in a colour"; only the Chicken Coop already says "chicken".

---

## 1. Shared style rules

### 1.1 Coordinates and envelope
- x right, y up, **front faces +Z** (towards the default camera). Units: 1 hex = circumradius 1.
- Footprint: keep everything inside x, z in [-0.7, 0.7] (1.4 square). Main mass sits slightly back (centre
  z = -0.1) so the front yard z in [0.3, 0.7] holds signs, props and faces that the camera sees.
- Grand Coop (`hall`): 1.3x envelope, x, z in [-0.92, 0.92]; keep the existing hex dais (r 1.0).
- Picket Fence (`wall`): still spans x in [-0.87, 0.87] edge to edge so neighbours join; depth z in [-0.2, 0.2].
- Height targets (top of highest solid part, flags excluded):

| Stage | 0 | 1 | 2 | 3 | 4 | 5 (hall) |
|---|---|---|---|---|---|---|
| Normal building | 0.70 | 0.85 | 1.00 | 1.15 | 1.30 | - |
| Tall family (Lookout Perch, Owl Academy) | 0.90 | 1.10 | 1.25 | 1.45 | 1.60 | - |
| Grand Coop | 1.00 | 1.20 | 1.40 | 1.65 | 1.85 | 1.95 |

- Footprint also grows: stage 0 uses about |x| <= 0.5, stage 4 uses the whole square.

### 1.2 Proportions (the "chunky" recipe)
- **Low, fat walls, big hats.** One storey = 0.35 to 0.45 tall. Roof height = 0.8 to 1.1x the wall height.
- **Roof overhang 0.08 to 0.10 on every side**, roof slabs 0.06 to 0.08 thick, so the eave edge reads as a fat
  band under the outline. Cover every ridge with a round ridge roll (cylinder r 0.04 to 0.05).
- **Taper.** Walls lean in slightly (`taperBox`, top = 0.92 to 0.95 of the base). Towers and silos use
  `cyl(rTop = 0.9 * rBot)`. Nothing is a perfectly straight box at main-mass scale.
- **Front gables.** Signature buildings turn the ridge to run along Z (`rotY: PI/2`) so the triangular gable end
  faces the camera. That triangle is where faces, round windows, signs and loft doors go.
- **Oversized details.** Doors 0.18 to 0.24 wide and 0.26 to 0.32 tall regardless of building size; windows are
  round, r 0.06 to 0.08; signs 0.2 to 0.3 across. Props (eggs, sacks, bales) are 1.3x real proportion.
- **Minimum thickness 0.035** for anything that should show its own colour (poles, rails, pennants, board trim).
  Thinner parts are allowed only as deliberate ink lines (ropes, wires, a weathervane rod).
- **Round over boxy:** use spheres, hemispheres, capsules and cylinders for anything organic or soft (hay,
  sacks, eggs, mounds, rocks, bushes, nests, domes, barrels). Boxes are allowed for planks, crates, door slabs and
  wall masses, and wall masses should be `roundBox` or `taperBox`, never a plain `box`, from stage 1 up.

### 1.3 Stage language (every building follows this, so level reads the same everywhere)
| Stage | Materials | Adds |
|---|---|---|
| 0 | raw `timberLight` walls, `thatch` roof, `timber` posts | one main mass, 1 to 2 props |
| 1 | walls painted family colour, roof in family roof colour | round window, sign or motif, 2 to 3 props |
| 2 | same | **second volume** (storey, wing, silo, tower): the big silhouette jump |
| 3 | `roundBox` stone plinth (h 0.08 to 0.12, `stoneLight`) under the main mass | signature landmark (weathervane, dome, crest, giant prop), a mini chicken |
| 4 | gold ridge roll or gold finial | team `banner` (existing helper), 2 mini chickens, fuller yard |
| 5 (hall) | gold on every ridge and finial | giant golden egg |

The team colour (`c.banner`) appears as cloth only: banners, pennants, awnings stripes, shields. Never as wall paint.

### 1.4 Chicken / farm motifs (use at least one per building, never more than three)
Eggs (white `0xf4f0e6`, brown `0xd9a46a`, gold `PAL.gold`), red three-lobed combs on ridges, rooster weathervanes,
feather tufts as finials, nests (straw torus with eggs), corn cobs, feed sacks, round hay bales, picket fences,
pop-holes with ramps, chicken-wire runs. Humans are the enemy: no human symbols on our buildings except the
scarecrow (fake farmer) and target dummies (farmer cut-outs).

### 1.5 Faces (special, 7 buildings only)
Faces go on: Grand Coop (gable is a chicken face), Pigsty (pig face on the gable), Owl Academy (owl tower,
stage 3+), Lookout Perch (eyes peering from the cabin, stage 3+), Worm Tavern (worm on the sign and annex),
Builder Hen's Shed (hard-hat roof with eyes), Rooster Barracks (mascot face, stage 4 only). No other building
gets eyes. Eyes follow the unit style: small dark
squares (`PAL.coal`) plus a tiny white highlight square, set 0.01 proud of the surface.

### 1.6 Palette
Keep `PAL`. Add a `FARM` const at the top of `parts.ts` (do not grow `PAL`); reuse `FEATHER` from `chickens.ts`.
```ts
export const FARM = {
  barnRed: 0xb6483a, barnRedDark: 0x8f3329, mustard: 0xd4a640, sage: 0x7f9c67, fadedBlue: 0x5d86a8,
  terracotta: 0xc9733c, egg: 0xf4f0e6, eggBrown: 0xd9a46a, corn: 0xf0c84a, cornLeaf: 0x7fa843,
  pink: 0xf0a8b4, pinkDark: 0xd98a99, mud: 0x6b4a32, wire: 0x9aa3a8, warm: 0xffc766, owl: 0x8a6a4a,
};
```
Family colours (walls / default roof). Move every hard-coded roof colour into `ROOF_DEFAULT` so `roofAccent` works.

| Building | Walls | Roof default |
|---|---|---|
| Grand Coop | `PAL.cream` + `timber` frame | `0x5a5a8c` (keep, it is the player's landmark colour) |
| Chicken Coop | `FARM.barnRed` | `PAL.roofRed` |
| Corn Field, Feed Silo | `PAL.cream`, bands `FARM.barnRedDark` | `FARM.barnRed` |
| Twig Yard, Pebble Pit, Golden Roost | `PAL.timberLight` | `0x9a5a38` |
| Egg Trading Post, Egg Market | `PAL.cream` | `FARM.terracotta` |
| Rooster Barracks | `PAL.stoneLight` + `timber` | `0x5f6d7c` |
| Egg Toss Range | `PAL.timberLight` | `PAL.roofOrange` |
| Pigsty | `FARM.pink` walls trimmed `timber` | `PAL.roofOrange` |
| Contraption Barn | `FARM.barnRed` | `0x6a4a34` |
| Nursing Nest | `PAL.white` | `0x6fae8a` |
| Owl Academy | `PAL.cream` | `0x4a7fb8` |
| Worm Tavern | `PAL.cream` + `timberDark` half-timber | `PAL.roofOrange` |
| Lookout Perch | `PAL.timber` / `stoneLight` | `PAL.roofRed` |
| Picket Fence | `PAL.white` pickets, `timber` posts | `PAL.roofRed` (gate caps only) |
| Builder Hen's Shed | `PAL.timberLight` | `FARM.mustard` (the hard hat) |

No saturated neon, no pure white (`PAL.white` 0xf1ece0 is the brightest), no pure black (`PAL.coal` is the darkest).

### 1.7 Shading, outlines, jitter
- Outlines: unchanged hull (0.09, wall 0.07). Hull colour is the vertex colour x 0.3, so dark parts get very
  dark outlines: keep `coal` for eyes, holes and pupils only.
- `jitter` (per-face brightness noise): **0.02** on walls, roofs, domes and other big smooth masses; **0** on
  eyes, signs, trim, windows, doors, gold; **0.05 to 0.08** only on organic piles (hay, soil, pebbles, crops, twigs).
  Default 0.05 makes rounded shapes look like patchwork: always pass `jitter`.
- Sphere `detail`: 1 for anything with r >= 0.05; 0 only for tiny bits (r < 0.05). Never detail 2.
- Recommended builder tweak (one line, `builder.ts` `part()`): add `smooth?: boolean` to `PartOpts`; when set and
  the geometry already has normals, skip `g.computeVertexNormals()` (applyMatrix4 already transforms them). Use
  `smooth: true` on spheres, hemispheres, capsules, silo and tower sides so cel bands curve like the units
  (DESIGN_LANGUAGE section 2). Never on boxes or roofs (they must stay crisp).
- AO: the builder darkens y < 0.45. Do not fight it with brighter base colours.

### 1.8 Do not
- No plain `box` main masses from stage 1; no ridges without a ridge roll; no roof without overhang.
- No parts thinner than 0.035 (except deliberate ink lines); no flat coplanar decals (offset >= 0.01).
- No parts hidden inside other parts that cost triangles (hemispheres instead of half-buried spheres).
- No floating parts: every part touches its support (check y bases: `box/cyl/cone/capsule` y = base,
  `sphere` y = centre).
- No crosses (Nursing Nest uses leaves), no skulls (banner skulls are danger markers only), no text, no weapons
  bigger than a prop, no monetisation look (no gem piles, no timers, no chests overflowing with coins).
- No more than 3 colours per building plus wood, stone, gold and team cloth.
- Do not change `wall` width (1.74) or move the main mass of any building outside its envelope.
- If a top height changes, update `damage()` in `index.ts` (it places broken roof bits at hard-coded `top`
  values 1.1 / 1.5 / 0.9): replace with a per-mesh `TOP_Y[meshId][stage]` table.

---

## 2. Parts wishlist (`src/render/meshes/buildings/parts.ts`)

Patterns: parts that need `rotY` around their own centre build into `new GeoBuilder(seed)` and append with
`GeoBuilder.transformed(sub, x, 0, z, rotY)` (as `hut()` does). Custom three geometries go through `b.part()`.
`RoundedBoxGeometry` comes from `three/examples/jsm/geometries/RoundedBoxGeometry.js` (bundled, offline-safe).

Triangle costs to budget with: box 12, `taperBox` 12, `roundBox` 108, cyl seg n = 4n, cone seg n = 2n,
sphere detail 0 = 20, detail 1 = 80, hemisphere (10 x 4) = 70, torus (5 x 10) = 100, capsule about 200
(use at most 2 per building; a scaled detail-1 sphere is cheaper).

| # | Signature | Build |
|---|---|---|
| P1 | `roundBox(b, x, y0, z, w, h, d, col, r = 0.04, o?: PartOpts): void` | `RoundedBoxGeometry(w, h, d, 1, r)` translated up h/2. Default wall mass from stage 1. |
| P2 | `taperBox(b, x, y0, z, w, h, d, col, taper = 0.93, o?): void` | `b.solid` with 8 verts: base w x d, top w*taper x d*taper. Stage 0 walls, plinths. |
| P3 | `softGable(b, x, y0, z, len, wid, h, col, o?: { rotY?: number; over?: number; thick?: number; infill?: Col; ridge?: Col }): number` | Ridge along local X. `infill` (wall colour) = `gable(len, wid, h)` with no overhang. Two slabs `BoxGeometry(len + 2*over, thick, L)` with `a = atan2(h, wid/2)`, `L = hypot(wid/2, h) + over`, rotX = side*a, centred half-way down each slope and lifted thick/2 along the slope normal; ridge roll cyl r 0.045 seg 8 along X (`rotZ: PI/2`), colour `ridge ?? mulRGB(col, 0.82)`. Defaults over 0.09, thick 0.07. Returns ridge top y. About 70 tris. |
| P4 | `barnRoof(b, x, y0, z, len, wid, h, col, o?: { rotY?: number; ridge?: Col; infill?: Col }): number` | Gambrel via `b.solid`, cross-section points (-w,0) (-0.7w,0.62h) (0,h) (0.7w,0.62h) (w,0) with w = wid/2 + 0.08, extruded len + 0.16 along X; ridge roll as P3; `infill` = same profile without overhang in wall colour. About 60 tris. |
| P5 | `domeRoof(b, x, y0, z, r, h, col, seg = 10): number` | `SphereGeometry(1, seg, 4, 0, 2PI, 0, PI/2)` scaled [r, h, r], smooth; lip ring cyl r*1.06, h 0.04, seg = seg, colour x0.82. Returns top. About 110 tris. |
| P6 | `roundWindow(b, x, y, z, r = 0.07, lit = false): void` | y is the centre. Frame cyl r + 0.025, depth 0.03, seg 10, `rotX: PI/2`, `timberDark`; pane cyl r, depth 0.03 at z + 0.012, `glass` emit 0.35, or `FARM.warm` emit 0.85 when lit; cross mullion box (2r x 0.02 x 0.01) `timberDark`. |
| P7 | `archDoor(b, x, z, w = 0.2, h = 0.3, col = PAL.timberDark): void` | Frame: box (w + 0.05) x (h - w/2) x 0.03 `timberLight` + disc cyl r (w + 0.05)/2 seg 10 at y h - w/2; door: same at w, z + 0.012, colour col; knob sphere r 0.018 `gold` detail 0; step `roundBox` (w + 0.1) x 0.04 x 0.1 `stoneLight` at z + 0.05. |
| P8 | `face(b, x, y, z, s = 1, kind: 'chicken' \| 'pig' \| 'owl' \| 'eyes'): void` | Facing +Z, y = eye line. Eyes: box 0.045s x 0.055s x 0.02 `coal` at x +-0.09s; highlight box 0.016s square `white` at the upper-inner corner, z + 0.012. chicken: beak cone r 0.06s h 0.13s seg 4 `rotX: PI/2` `FEATHER.beak` at y - 0.07s; wattle sphere r 0.035s scale [0.8, 1.4, 0.8] `FEATHER.red` under it. pig: snout cyl r 0.08s depth 0.05 seg 10 `rotX: PI/2` `FARM.pinkDark`, nostrils 2 boxes 0.02s `coal`; ears 2 cones r 0.06s h 0.12s seg 4 at y + 0.12s, x +-0.14s, `rotZ: +-0.6`. owl: each eye = disc cyl r 0.075s `white` + disc r 0.05s `gold` + box pupil 0.035s `coal`, beak cone r 0.03s h 0.07s pointing down, two ear-tuft cones r 0.04s h 0.12s at x +-0.16s. |
| P9 | `comb(b, x, y0, z, s = 1, alongX = true): void` | 3 spheres r 0.055s scale [0.7, 1.2, 0.9] `FEATHER.red` detail 1, jitter 0, centres at y0 + 0.05s (middle y0 + 0.07s), spaced 0.07s along X (or Z). Sits on ridges and dome tops. |
| P10 | `weathervaneRooster(b, x, y0, z, s = 1, col = PAL.gold): void` | Rod cyl r 0.012 h 0.22s `coal` (deliberate ink line); N-S arrow box 0.2s x 0.025 x 0.025 at y0 + 0.16s; rooster in **side profile facing +X** (reads from the front camera): body sphere r 0.06s scale [1.3, 1, 0.45] at y0 + 0.28s; head sphere r 0.035s at x + 0.07s, y + 0.06s; comb 3 spheres r 0.015s; beak cone; tail 3 cones r 0.025s h 0.09s fanned up-back. All col, emit 0.1, jitter 0, detail 0. About 130 tris. |
| P11 | `egg(b, x, y0, z, r = 0.04, col = FARM.egg, o?: PartOpts): void` | Sphere centre y0 + 1.1r, scale [0.85, 1.12, 0.85], detail 1 if r >= 0.05 else 0, smooth, jitter 0. Gold eggs pass `emit: 0.25`. |
| P12 | `nest(b, x, y0, z, r = 0.12, eggs = 3, eggCol = FARM.egg): void` | Torus `TorusGeometry(r, r * 0.38, 5, 10)` `rotX: PI/2` at y0 + 0.38r, `PAL.hay` jitter 0.06; inner plate r 0.8r `PAL.thatch`; eggs (P11, r = 0.32r) in a ring. About 100 + 20 per egg. |
| P13 | `hayBale(b, x, y0, z, rotY = 0, s = 1)` (rewrite, same signature) | `roundBox` 0.2s x 0.14s x 0.15s r 0.035s `PAL.hay` jitter 0.06 + twine band box 0.205s x 0.018 x 0.155s `PAL.timberLight` at mid height. |
| P14 | `roundBale(b, x, y0, z, r = 0.11, len = 0.16, rotY = 0): void` | Cyl seg 10 lying (`rotZ: PI/2`), centre y0 + r, `PAL.hay`, jitter 0.05; end discs r 0.7r 0.01 proud `PAL.thatch`. |
| P15 | `feedSack(b, x, y0, z, col = 0xd8c9a0, rotY = 0)` (replaces `sack`) | Sphere r 0.07 scale [1, 1.15, 0.8] detail 1 smooth; neck cone r 0.03 h 0.04 inverted on top; tuft sphere r 0.022; corn badge sphere r 0.022 scale [1, 1, 0.3] `FARM.corn` on the front. |
| P16 | `eggSign(b, x, y0, z, s = 1, col = FARM.egg): void` | Post cyl r 0.025s h 0.45s `timberDark`; egg sphere r 0.1s scale [0.85, 1.15, 0.45] detail 1 at y0 + 0.55s, jitter 0; rim ring cyl r 0.105s depth 0.03 `rotX: PI/2` `timberDark` behind it. |
| P17 | `picketFence(b, x0, z0, x1, z1, h = 0.2, col = PAL.white): void` | Pickets box 0.05 x h x 0.03 every 0.11 + pointed cap cone r 0.036 h 0.05 seg 4; two rails box 0.035 tall; end posts cyl r 0.04 seg 6 h + 0.04 with sphere cap r 0.045. Replaces `fence` on every building. |
| P18 | `wireRun(b, x0, z0, x1, z1, h = 0.18): void` | Posts cyl r 0.03 seg 6 `timber`; wire panel = box (len) x h x 0.01 `FARM.wire` with `emit: 0`, plus top rail box 0.035 `timberLight`. Reads as a chicken run. |
| P19 | `miniChicken(b, x, y0, z, rotY = 0, s = 1, col = FARM.egg): void` | Cheap resident (about 110 tris, 0.18 tall at s = 1): body sphere r 0.07s scale [0.95, 0.95, 1.2] detail 0; head sphere r 0.042s at y + 0.13s, z + 0.05s; comb sphere r 0.02s red; beak cone seg 4; 2 eye boxes 0.012s; tail cone seg 4. Built in a sub-builder then rotated. No legs (sits). |
| P20 | `cornStalk(b, x, z, h = 0.3, ripe = true): void` | Stalk cyl r 0.018/0.026 seg 5 `FARM.cornLeaf`; 2 leaves cone r 0.03 h 0.16 seg 3 at 0.45h, `rotZ: +-1.0`; if ripe a cob sphere r 0.032 scale [0.8, 1.8, 0.8] `FARM.corn` at 0.6h, x + 0.03; tassel cone r 0.02 h 0.06 `PAL.thatch` on top. About 50 tris. |
| P21 | `cornRow(b, x0, x1, z, h, ripe): void` | Cheap row: cyl seg 6 lying along X, r = h/2, scale [1, 1, 0.7], `FARM.cornLeaf` jitter 0.07, sitting on the soil; if ripe, cob spheres every 0.18 on the +Z side. |
| P22 | `barrel(b, x, y0, z, s = 1)` (rewrite, same signature) | Two cyls seg 10: bottom r 0.05 -> 0.065 h 0.075s, top 0.065 -> 0.05 h 0.075s (bulge), two hoops r 0.068 h 0.018 `coal`. |
| P23 | `chimney(b, x, y0, z, h)` (rewrite, same signature) | Cyl r 0.08/0.09 seg 8 `stone`, `rotZ: 0.06` lean; lip cyl r 0.1 h 0.045 `stoneDark`. |
| P24 | `flag` / `banner` (keep signatures) | Thicken: pole r 0.022, cloth depth 0.03, pennant cross-bar 0.03. Pennant tip = cone seg 3 (triangle) not a box. |
| P25 | `pebblePile(b, x, y0, z, r = 0.18, col = PAL.stone): void` | 5 to 7 detail-0 spheres r 0.05 to 0.09 alternating `stone` / `stoneLight`, jitter 0.06, packed into a dome of radius r. |
| P26 | `lantern(b, x, y0, z): void` | Hook box 0.03 `coal`, body cyl r 0.03 h 0.06 seg 6 `FARM.warm` emit 1, cap cone r 0.04 h 0.03 `coal`. |

Cheap variants (added after QA, see `11-building-qa-report.md` re-check): buildings never keep private copies of
fences, combs, nests, bales or hens. They call the shared part with its budget option: `comb(.., LOW_COMB)`,
`picketFence(.., LOW_FENCE)` or `picketRun` (shared corner posts), `nest(.., lite)`, `hayBale(.., lite)`,
`roundBale(.., lite)`, `miniChicken(.., lite)`, `weathervaneRooster(.., lite)`, `domeRoof(.., { rings: 2 })`,
`egg(.., detail 0)`. Use `pyramid` instead of `b.cone` for small cones (2n - 2 triangles instead of 3n).

---

## 3. Per-building plans

Notation: `name(x, y0, z, ...)` uses the builder/parts arguments above. "+" = added at this stage on top of the
previous stage (everything persists unless "replace"). Colours from `PAL`, `FARM`, `FEATHER`. `c.roof`,
`c.banner` as today. All stage tops must meet the table in 1.1.

### 3.1 Grand Coop (`hall`, stages 0..5) - "the giant hen-house that becomes a coop castle"
Keep the hex dais (two cyls, top at y G = 0.12). The front gable is a chicken face at every stage: two round lit
windows as eyes, a beak-shaped awning over the door, a comb on the front end of the ridge.
- **S0 "Big Coop"** (top 1.0): walls `taperBox(0, G, -0.1, 0.9, 0.45, 0.7, timberLight)`; corner posts cyl r 0.04
  seg 6 `timber`. Roof `softGable` ridge along Z (`rotY: PI/2`, len 0.7, wid 0.9, h 0.42, `thatch`, infill
  `timberLight`). Gable face: `roundWindow(+-0.17, G + 0.62, 0.26, 0.07, lit)`, beak awning cone r 0.11 h 0.18
  seg 4 `rotX: PI/2` `FEATHER.beak` at (0, G + 0.38, 0.27), `comb(0, ridgeTop - 0.02, 0.3, 1.4, alongX = false)`.
  `archDoor(0, 0.26, 0.24, 0.3)`. Two `hayBale` at (+-0.55, G, 0.4). `flag` at (0.35, ridgeTop - 0.1, -0.3, 0.3).
- **S1 "Coop with nest wing"** (top 1.2): replace walls with `roundBox(..., 0.92, 0.5, 0.72, PAL.cream)` and a
  `timber` belt box 0.04 at y G + 0.24; roof colour `c.roof`, h 0.46. + left lean-to nest wing `roundBox(-0.62,
  G, -0.05, 0.34, 0.32, 0.56, timberLight)` with `shed` roof (len 0.44, wid 0.66, h 0.16, `c.roof`); three
  pop-holes on its front (coal discs r 0.045 seg 8, `rotX: PI/2`) with an `egg` peeking from the middle one.
  + `weathervaneRooster` on the rear ridge end (replaces the flag). + `eggSign(0.6, G, 0.45, 0.9)`.
- **S2 "Barn and wings"** (top 1.4): main mass `roundBox(0, G, -0.1, 1.0, 0.56, 0.8, cream)`, roof `barnRoof`
  ridge along Z (len 0.8, wid 1.0, h 0.5, `c.roof`, infill cream). Hay-loft door box 0.2 x 0.18 `timberDark` at
  (0, G + 0.74, 0.31) above the eyes, hoist beam box 0.04 x 0.04 x 0.22 sticking out +Z at G + 0.98. Wings
  both sides (replace nest wing): `roundBox(+-0.7, G, -0.05, 0.36, 0.38, 0.6, cream)` + `softGable` ridge along
  X (len 0.36, wid 0.6, h 0.26); one `roundWindow` each. Silo back-right: cyl (0.6, G, -0.62) r 0.18/0.2 h 0.9
  seg 10 `cream` smooth, 2 bands `barnRedDark` h 0.04, `domeRoof(r 0.21, h 0.16, c.roof)`. Two `banner` at
  (+-0.33, G, 0.42, 0.85).
- **S3 "Farmstead"** (top 1.65): + stone plinth `roundBox(0, G, -0.1, 1.15, 0.1, 0.92, stoneLight)` under the
  barn (raise barn by 0.1). + cupola on the ridge: `roundBox` 0.24 x 0.22 x 0.24 `white` with two black slot
  windows + `hip` 0.34 x 0.34 x 0.2 `c.roof`; weathervane moves on top of it. + second silo back-left (mirror,
  h 0.75). + front `picketFence` from (-0.85, 0.78) to (-0.2, 0.78) and (0.2, 0.78) to (0.85, 0.78) (gate gap).
  + `nest` with 3 eggs at (-0.55, G, 0.5). + `miniChicken` at (0.45, G, 0.55).
- **S4 "Coop Castle"** (top 1.85): wings become two storeys (+ `roundBox` 0.32 x 0.3 x 0.54 cream on top, roof
  moves up). + two front nest towers at (+-0.78, G, 0.42): cyl r 0.15/0.17 h 0.62 seg 10 `cream` smooth, timber
  belt, `roundWindow` lit at h 0.42, `domeRoof(r 0.19, h 0.17, c.roof)` + `comb` on top. Silo domes get a `comb`
  each. + second `miniChicken` on the fence gap. Ridge rolls stay roof colour.
- **S5 "Golden Coop"** (top 1.95): every ridge roll, dome lip and comb becomes `PAL.gold` (emit 0.1). Cupola roof
  `gold`. Replace the weathervane with a golden egg: `egg(0, cupolaTop, -0.1, 0.1, gold, emit 0.25)`. + gold trim
  band box 0.03 tall around the barn at the eave line. + statue in the front yard: cyl r 0.13 h 0.12 `stoneLight`
  + `egg(0, G + 0.12, 0.62, 0.08, gold)`. Budget: up to 1800 tris (hall only).

### 3.2 Chicken Coop (`house`) - already right in spirit; make it rounder and step it up
Keep stilts, ramp, nest box, round window. Ridge along X stays (the side with the ramp is the front).
- **S0** (top 0.7): smaller coop `taperBox(0, 0.14, 0, 0.56, 0.3, 0.46, timberLight)` on 4 stilt cyls r 0.035
  h 0.1; `softGable(len 0.56, wid 0.46, h 0.28, thatch)`; pop-hole + ramp as today; one `egg` by the ramp.
- **S1** (top 0.85): walls `roundBox` 0.7 x 0.36 x 0.58 `FARM.barnRed`, 3 white trim boards 0.04 wide 0.01 proud;
  roof `softGable` h 0.32 `c.roof`; `roundWindow(0.2, 0.32, 0.3)`; side nest box with `shed` roof and 2 eggs;
  straw pile (cyl r 0.12 h 0.05 `hay`) at the door; `comb` on the ridge centre (s 1.0).
- **S2** (top 1.0): + loft storey `roundBox` 0.56 x 0.24 x 0.46 `barnRed` (as today), roof moves up; loft
  `roundWindow` lit; `chimney` stub.
- **S3** (top 1.15): + `roundBox` stone plinth under the stilts; + `wireRun` from (-0.6, 0.6) to (0.6, 0.6)
  and both sides back to z 0.05; `roundBale` inside; `miniChicken` inside the run.
- **S4** (top 1.3): + `weathervaneRooster` on the ridge; flower box under the window (box 0.22 x 0.05 x 0.06
  `timber` + 3 spheres r 0.03 in `0xd9779a` / `0xf0dc6a`); second `miniChicken` on the ramp; `banner` at
  (-0.62, 0, 0.25, 0.8).

### 3.3 Corn Field (`farm`) - "a corn patch that grows taller every stage"
Drop the boxy barn. The field is the hero: corn height is the level meter.
- **S0** (top 0.35): soil `roundBox(0, 0, 0.05, 1.05, 0.06, 0.95, soil, 0.03)` jitter 0.05; 4 `cornRow` rows
  (x -0.42..0.42) at h 0.1 green, no cobs; a feed sack and a little stump.
- **S1** (top 0.55): rows h 0.18; + `picketFence` front (z 0.6) and sides (x +-0.6, z 0.6 to -0.4); + a water
  trough (roundBox 0.26 x 0.08 x 0.1 `timber`, inner plate `PAL.blue` x0.8).
- **S2** (top 0.8): rows h 0.24 with cobs (ripe); 6 `cornStalk` (h 0.36) along the front row for the silhouette;
  + scarecrow at (-0.48, 0.06, 0.25): post cyl r 0.022 h 0.5, arm bar box 0.26 x 0.035, head sphere r 0.065
  `PAL.hay`, straw hat (cyl r 0.11 h 0.02 + cyl r 0.06 h 0.05 `PAL.hay`), shirt box 0.14 x 0.16 x 0.06 flannel
  `0xb3453c` (a fake farmer: funny because the chickens use it).
- **S3** (top 1.1): + corn crib at back (0.45, 0, -0.5): cyl r 0.18 h 0.5 seg 10 `FARM.wire` with 3 `timber`
  hoops, cob pile inside (dome `FARM.corn`), `domeRoof(r 0.21, h 0.12, c.roof)`; + `roundBale` x2 stacked at
  (-0.5, 0, -0.45).
- **S4** (top 1.3): + windpump at (-0.45, 0, -0.55): 4-leg taper tower (`taperBox` 0.18 x 0.9 x 0.18 frame faked
  by 4 thin cyl r 0.025 leaning in), fan = 8 boxes 0.16 x 0.035 x 0.02 radiating around a hub sphere, facing +Z,
  at y 1.0, tail fin; rows become 8 `cornStalk`s front + rows h 0.3; `banner`.

### 3.4 Twig Yard (`lumber`) - "a giant woven twig nest"
- **S0** (top 0.5): 2 twig bundles (`logPile` rows 3, len 0.4, logs r 0.04), chopping stump cyl r 0.1 h 0.12
  with an axe (handle box 0.04, head box 0.08 x 0.06 x 0.03 `stoneLight`), a `feedSack`.
- **S1** (top 0.75): + small shed `roundBox(-0.25, 0, -0.3, 0.5, 0.32, 0.4, timberLight)` + `shed` roof `c.roof`
  h 0.16 + `archDoor`; bundles tied with `PAL.hay` twine bands.
- **S2** (top 0.95): + the signature nest heap at (0.25, 0, 0.1): torus r 0.3 tube 0.12 (`TorusGeometry(0.3,
  0.12, 5, 12)`, `rotX: PI/2`) `timberLight` jitter 0.08 + 8 twig sticks (cyl r 0.018 h 0.3, random tilts 0.5 to
  1.0 rad, alternating `timber`/`timberLight`) poking out, inner plate `timber`.
- **S3** (top 1.15): + shed becomes `softGable` front-gable with a loft; + sawhorse with a log; + 2 eggs in the
  nest (it is a home now); + `miniChicken` on the rim.
- **S4** (top 1.3): + tall twig stack tower at (-0.55, 0, 0.35): 3 tiers of `logPile` standing upright as a tepee
  (6 cyl r 0.035 h 0.9 leaning to a point, `timber` / `timberLight`) with a `featherTuft` finial (3 cones in
  `FEATHER.wing`); `banner`.

### 3.5 Pebble Pit (`quarry`) - "round pebble heaps and a bucket pulley"
Replace all stepped slabs with rounded heaps.
- **S0** (top 0.4): dirt plate `plate(0, 0, 0, 0.62, 0.05, dirt, 14)` + inner pit plate r 0.4 h 0.02
  `0xb59468`; 3 `pebblePile` (r 0.16, 0.12, 0.1); a shovel stuck in the biggest pile.
- **S1** (top 0.85): + bucket pulley: two posts cyl r 0.035 h 0.8 `timber` at (0.35 +- 0.15, 0, -0.3), cross beam
  cyl r 0.03 `rotZ: PI/2`, rope (ink line), bucket cyl r 0.08/0.06 h 0.1 `timber` with pebbles in it.
- **S2** (top 0.95): + sorting shed `roundBox(-0.35, 0, -0.35, 0.44, 0.34, 0.36, timberLight)` + `softGable`
  `c.roof` h 0.24; a sieve (cyl r 0.14 h 0.04 `FARM.wire` on 3 legs).
- **S3** (top 1.1): + stone plinth for the shed; + cart on 2 rails (rails box 0.035 `stoneDark`): `roundBox`
  0.3 x 0.12 x 0.2 `timber`, wheels cyl r 0.07 seg 10, load = `pebblePile` r 0.1; + `miniChicken` pecking grit.
- **S4** (top 1.3): pulley grows to a tall A-frame (posts h 1.1 leaning, `rotZ +-0.15`), bucket raised high;
  gold-rimmed sign `eggSign` with a grey stone egg (col `stoneLight`); `banner`.

### 3.6 Golden Roost (`mine`) - "a round hill where a golden hen nests"
- **S0** (top 0.5): mound `domeRoof(0, 0, -0.15, 0.55, 0.45, stone)` smooth (no lip), second hump `domeRoof(0.3,
  0, -0.4, 0.3, 0.3, stoneLight)`; arched entrance at front: `archDoor` 0.3 x 0.3 in `coal` with a `timber`
  frame (two cyl posts r 0.04 + lintel cyl `rotZ: PI/2`); cart with one gold `egg` (r 0.05).
- **S1** (top 0.65): + `lantern` by the door; + scattered gold nuggets (2 detail-0 spheres r 0.04 gold emit 0.3);
  mound grows (r 0.6, h 0.52).
- **S2** (top 0.9): + ladder up the right side (2 rails box 0.035, 5 rungs) to a perch bar on top (cyl r 0.025
  len 0.4 on 2 posts); + small hut `roundBox` 0.3 x 0.22 x 0.28 `timberLight` + `softGable` at (-0.55, 0, 0.05).
- **S3** (top 1.05): + golden `nest(0, moundTop - 0.04, -0.15, 0.16, 3, PAL.gold)` with eggs emit 0.25;
  `miniChicken` (plumage `0xe8c27a`, golden hen) sitting in it; cart now carries 3 gold eggs.
- **S4** (top 1.3): + giant golden egg on a stone pedestal at (0.45, 0, 0.35): cyl r 0.1 h 0.1 `stoneLight` +
  `egg(r 0.11, gold, emit 0.3)`; mound gets a `stoneDark` belt of pebbles (`pebblePile` x3 at the base);
  `banner`.

### 3.7 Feed Silo (`storehouse`) - "a fat corrugated grain silo"
- **S0** (top 0.7): squat bin cyl (0, 0, -0.1) r 0.28/0.3 h 0.42 seg 12 `cream` smooth, 3 bands cyl r 0.305 h 0.03
  `barnRedDark`; cone roof r 0.34 h 0.2 seg 12 `c.roof` + cap sphere r 0.04; 3 `feedSack` at front.
- **S1** (top 0.85): + door box 0.16 x 0.24 `timberDark` on the bin front; + side ladder (rails + 4 rungs); bin
  h 0.5; + 2 more sacks and a `barrel`.
- **S2** (top 1.05): bin becomes a tall silo h 0.75 (r 0.28) with 4 bands; roof becomes `domeRoof(r 0.31, h 0.2)`;
  + lean-to feed shed at (-0.45, 0, -0.05): `roundBox` 0.36 x 0.32 x 0.5 `FARM.barnRed` + `shed` roof.
- **S3** (top 1.2): + second silo (0.42, 0, -0.35) r 0.2 h 0.6 with dome; + catwalk box 0.32 x 0.035 x 0.08
  `timber` between the dome lips; + feed chute (cyl r 0.04 h 0.4 `stoneLight`, `rotZ: 0.6`) pouring into a
  trough; stone plinths under both silos; `miniChicken` at the trough.
- **S4** (top 1.35): main silo h 0.85; `comb` on top of the main dome (s 1.2); big corn badge on the silo front
  (sphere r 0.07 scale [0.7, 1.4, 0.25] `FARM.corn` + 2 leaf cones `cornLeaf`); `banner`.

### 3.8 Egg Trading Post (`tradingpost`) - "a covered wagon full of egg crates"
- **S0** (top 0.5): hand cart: `roundBox` bed 0.5 x 0.1 x 0.32 `timber` at y 0.12, 2 wheels cyl r 0.12 seg 10
  `rotX: PI/2`, 2 egg crates (box 0.14 `timberLight` with 4 `egg`s r 0.03 on top), parasol (pole cyl r 0.022
  h 0.45 + cone r 0.25 h 0.1 seg 8 `FARM.terracotta`, cream tip sphere r 0.03).
- **S1** (top 0.8): replace with covered wagon (as today) but hood = half-cylinder: `CylinderGeometry(0.22, 0.22,
  0.8, 10, 1, true, -PI/2, PI)` lying along X, `cream`, plus 3 hoop ribs (cyl r 0.23 h 0.03 `timber`); front
  wheels r 0.14, back r 0.16; egg crates stacked at back.
- **S2** (top 0.95): + office hut at (-0.5, 0, -0.42): `roundBox` 0.42 x 0.3 x 0.3 `cream` + front-gable
  `softGable` `c.roof`; + hitching rail with a `feedSack`; + awning shed roof on 2 posts over the counter.
- **S3** (top 1.1): + hanging `eggSign` gold (s 1.0) on an L-bracket from the hut; + stone plinth for the hut;
  + `nest` basket of eggs on the counter; `miniChicken` trader behind it.
- **S4** (top 1.3): + second smaller wagon (scale 0.7) with a `FARM.mustard` hood at back right; crates
  piled 3 high; `banner`.

### 3.9 Egg Market (`market`) - "striped egg stalls round a giant egg"
- **S0** (top 0.6): paving `plate` r 0.65 h 0.05 hex (seg 6) `stoneLight`; one stall (as `stall()`, awning
  boxes 0.035 thick, goods = `egg`s in a basket cyl r 0.08 h 0.05 `PAL.thatch`).
- **S1** (top 0.75): + second stall; awnings get a rounded front edge (cyl r 0.03 along X under each awning in
  the darker stripe colour).
- **S2** (top 0.95): + market house at back `roundBox(0, 0.05, -0.42, 0.8, 0.36, 0.34, cream)` + `softGable`
  `c.roof` h 0.28 + 2 `roundWindow`; + third stall.
- **S3** (top 1.15): + centre egg fountain at (0, 0.05, 0.3): basin cyl r 0.18/0.2 h 0.1 seg 10 `stoneLight`,
  water plate r 0.16 `PAL.blue`, egg statue `egg(r 0.09, FARM.egg)` on a short column; bunting: a string
  (ink line) between two posts with 6 triangle flags (cone seg 3) alternating `c.banner` and `cream`.
- **S4** (top 1.3): + gold egg on the market-house ridge (`egg` r 0.08 gold emit 0.2); market house gets a
  `comb` on each gable end; `miniChicken` x2 shopping; `banner`.

### 3.10 Rooster Barracks (`barracks`) - "a fortified hall wearing a rooster's crest"
Family cue (all stages): a giant red comb crest on the ridge, like a helmet plume.
- **S0** (top 0.7): canvas tent hall: `hip(0, 0, -0.1, 0.9, 0.6, 0.55, cream)` + `comb` on top (s 1.4), 3 pot-lid
  shields (cyl r 0.08 `stoneLight`, boss sphere in `c.banner`) on a rack, straw training dummy.
- **S1** (top 0.85): replace with hall `roundBox(0, 0, -0.1, 1.0, 0.4, 0.62, stoneLight)` + timber belt +
  `softGable` h 0.36 `c.roof` + comb crest along the ridge (3 `comb`s, s 1.3, spaced 0.25) + `archDoor`;
  training dummy becomes a farmer cut-out (flat roundBox 0.16 x 0.26 x 0.03 `0xb3453c` with straw-hat disc).
- **S2** (top 1.05): + upper storey `roundBox` 0.8 x 0.24 x 0.5; roof up; + front watch-tower at (0.5, 0, -0.4)
  cyl r 0.16/0.18 h 0.85 seg 10 `stoneLight` + cone roof r 0.22 h 0.3 `c.roof` + `comb` on its tip.
- **S3** (top 1.15): + pointed picket palisade front (`picketFence` h 0.26, `timberLight`, from (-0.65, 0.55) to
  (0.65, 0.55) with a gate gap); + stone plinth; + pitchfork rack (3 poles r 0.02 with 3 tine cones each).
- **S4** (top 1.3): + rooster figurehead (the regiment mascot) on the front wall under the eave: full
  `face(0, eaveY - 0.12, wallFrontZ + 0.01, 1.1, 'chicken')` plus a `comb` above it; + second tower (mirror);
  `banner` x2. (This makes the barracks the seventh face: allowed, it is the mascot.)

### 3.11 Egg Toss Range (`archery`) - "an open shed, egg baskets and farmer targets"
- **S0** (top 0.6): one target: straw bale (`hayBale` s 1.3) + bullseye discs (as today, depth 0.03) on a stand;
  basket of eggs (cyl r 0.1/0.08 h 0.1 `PAL.thatch` + 5 `egg`s); a throwing line (box 0.6 x 0.02 x 0.04 `white`).
- **S1** (top 0.8): + open shed: 4 posts cyl r 0.04 h 0.42 `timber`, back wall `roundBox` 1.0 x 0.32 x 0.1,
  `softGable` h 0.32 `c.roof`; + second target.
- **S2** (top 0.95): + third target; one target is a farmer cut-out (roundBox 0.18 x 0.32 x 0.035 `0xb3453c`,
  head disc `PAL.skin`, hat disc `PAL.hay`) with egg splats (flattened `egg` spheres scale [1, 1, 0.2] `FARM.egg`
  plus a yolk sphere r 0.02 `FARM.corn`).
- **S3** (top 1.15): + watch loft over the shed (box floor + rail) with a `miniChicken` taking aim; + stone plinth;
  + egg crates.
- **S4** (top 1.3): + giant slingshot at (0.55, 0, -0.35): Y-fork from 3 cyls r 0.04 (trunk h 0.45, arms 0.3 at
  +-0.4 rad) `timber`, band box 0.2 x 0.03 `FARM.pinkDark`, a big egg r 0.06 in the pouch; `banner`.

### 3.12 Pigsty (`stable`) - "a pink barn with a pig face and a mud wallow"
- **S0** (top 0.55): lean-to `roundBox(0, 0, -0.3, 0.8, 0.3, 0.4, timberLight)` + `shed` roof h 0.18
  `thatch`; mud puddle: flattened sphere r 0.28 scale [1, 0.08, 0.7] `FARM.mud` jitter 0 at (0.1, 0, 0.3) (no
  outline issue: keep it 0.02 tall above ground); trough.
- **S1** (top 0.8): walls `FARM.pink` with `timber` corner posts; roof becomes front-gable `softGable` `c.roof`;
  + `picketFence` paddock (`timberLight`) around the puddle.
- **S2** (top 1.0): + pig face on the front gable infill: `face(0, eaveY + 0.12, gableZ + 0.01, 1.2, 'pig')`
  (ears are the face's own cones above the eyes); walls h 0.4; + two half-doors as today.
- **S3** (top 1.15): + stone plinth; + side hay loft `roundBox` + `softGable` ridge along X; + piglet in the mud
  (the existing `pigBody` is too heavy: use sphere r 0.1 scale [1, 0.85, 1.4] `FARM.pink` + snout disc +
  2 eye boxes, about 60 tris); saddle rack (box + blanket in `c.banner`).
- **S4** (top 1.3): + curly-tail weathervane (pig in profile, analogous to P10, `FARM.pinkDark`); second piglet;
  `banner`.

### 3.13 Contraption Barn (`workshop`) - "a red barn bursting with gears and a crane"
- **S0** (top 0.6): workbench (`roundBox` 0.5 x 0.2 x 0.24 `timber`) under a lean-to; a cog (cyl r 0.14 seg 8
  `stoneDark` + 8 tooth boxes 0.05) leaning on it; a barrel.
- **S1** (top 0.85): + barn `roundBox(0, 0, -0.2, 0.9, 0.4, 0.6, FARM.barnRed)` + `barnRoof` ridge along X
  `c.roof` h 0.36; white X-braced barn door (box 0.3 x 0.3 + two diagonal boxes 0.04 `white`).
- **S2** (top 1.05): + big gear on the front gable side (cyl r 0.2 + teeth, `stoneLight`, hub sphere `gold`); +
  `chimney` with `smokePuff`; barn h 0.48.
- **S3** (top 1.2): + crane: A-frame posts h 1.0, arm with a dangling `roundBale` (instead of a boulder);
  + stone plinth; + `miniChicken` wearing goggles (2 small cyl r 0.02 `glass` on the eyes).
- **S4** (top 1.35): + egg-catapult prototype in the yard (a small copy of `eggCatapult` geometry at scale 0.7,
  or 30 percent of its parts: frame, arm, bucket, egg); second gear meshing with the first; `banner`.

### 3.14 Nursing Nest (`infirmary`) - "a soft white cottage around a giant warm nest"
Keep the `leafSign` (no cross). Warm lamp glow is the motif.
- **S0** (top 0.5): a big `nest(0, 0, 0.1, 0.25, 3)` with a cream canopy tent `hip` 0.5 x 0.5 x 0.3 behind it;
  `leafSign` s 1.0.
- **S1** (top 0.8): + cottage `roundBox(0, 0, -0.25, 0.8, 0.38, 0.5, white)` + `softGable` `c.roof` h 0.32 +
  `archDoor` + 2 `roundWindow` lit; nest moves to (0.35, 0, 0.4).
- **S2** (top 1.0): + second storey `roundBox` 0.62 x 0.26 x 0.42 white; roof up; heat lamp over the nest
  (post + hook + `lantern`, emit 1); herb garden bed with 3 sphere bushes.
- **S3** (top 1.15): + stone plinth; + sun-room annex (cyl r 0.2 h 0.3 seg 10 `glass` emit 0.3 + `domeRoof`
  `c.roof`) at (-0.5, 0, 0.0); + `miniChicken` on the nest (a hen keeping eggs warm).
- **S4** (top 1.3): + `chimney` + `smokePuff`; leaf sign s 1.25; second nest; `banner`.

### 3.15 Owl Academy (`academy`) - "a schoolhouse whose tower turns into a wise owl"
- **S0** (top 0.9): schoolhouse `taperBox(0, 0, -0.1, 0.8, 0.4, 0.6, timberLight)` + front-gable `softGable`
  `thatch` + bell frame on the ridge (2 posts + `hip` roof + gold sphere bell r 0.04); slate board on an easel.
- **S1** (top 1.1): walls `cream`, roof `c.roof`; 2 columns cyl r 0.05 seg 8 `white` + porch; stack of books
  (3 roundBoxes 0.16 x 0.04 x 0.12 in `FARM.fadedBlue`, `barnRed`, `sage`).
- **S2** (top 1.25): + tower at (-0.4, 0, -0.38): cyl r 0.22/0.25 h 0.8 seg 10 `stoneLight` smooth +
  `domeRoof(r 0.27, h 0.24, c.roof)` + gold finial.
- **S3** (top 1.45): tower h 0.95; the dome becomes an owl head: `face(towerX, domeBase + 0.1, towerZ + 0.27, 1.3,
  'owl')` on the +Z side of the dome, ear tufts on the dome top; dome colour `FARM.owl` with `c.roof` lip;
  + stone plinth; + `picketFence` front in `stoneLight`.
- **S4** (top 1.6): tower h 1.1; + mortarboard on the owl (box 0.32 x 0.03 x 0.32 `coal` + tassel cone `gold`);
  + open-book banner (as today, thicker); + `miniChicken` student with a book; `banner`.

### 3.16 Worm Tavern (`tavern`) - "a cosy half-timbered inn with a worm in an apple"
- **S0** (top 0.65): small hut `taperBox` 0.6 x 0.36 x 0.5 `timberLight` + `softGable` `thatch`; `warmWindows`
  x1; 2 `barrel`s; a round table (cyl r 0.1 top + leg).
- **S1** (top 0.85): walls `cream` with `timberDark` half-timber (as today, boxes 0.04); roof `c.roof`; hanging
  sign: roundBox 0.22 x 0.18 x 0.04 `gold` on an L-bracket with a worm on it (2 overlapping pink spheres r 0.03
  `FARM.pink` + 2 eye boxes), lit windows x3.
- **S2** (top 1.05): + second storey (overhanging the front by 0.05, as half-timber jetty) `roundBox` 0.96 x 0.32
  x 0.68; `chimney` + `smokePuff`; lit windows upstairs.
- **S3** (top 1.15): + stone plinth; + beer garden: 2 tables + 4 stump stools + `picketFence` (z 0.62);
  `miniChicken` x1 at a table.
- **S4** (top 1.3): + the apple annex at (0.5, 0, -0.42): sphere r 0.26 scale [1, 0.9, 1] `0xc0463a` smooth,
  detail 1, a round lit door, stem cyl r 0.025 `timberDark` + leaf (sphere scale [0.6, 0.1, 1] `cornLeaf`);
  a worm poking out of the side: 3 spheres r 0.05 decreasing `FARM.pink` in an arc + head with 2 eyes + tiny
  `PAL.blue` cap; `banner`.

### 3.17 Lookout Perch (`tower`) - "a chicken perch that becomes a crow's-nest tower"
- **S0** (top 0.9): ladder pole: one thick post cyl r 0.06 h 0.8 `timber` + ladder beside it; at the top a nest
  basket (`nest` r 0.18, 0 eggs) on a plate; a `flag`.
- **S1** (top 1.1): 3 legs (cyl r 0.045 h 0.95, leaning in `rotZ/rotX +-0.12`) `timber` around a platform
  cyl r 0.3 h 0.06; nest basket rail (torus r 0.3 tube 0.04 `timberLight`); umbrella roof cone r 0.36 h 0.24
  seg 8 `c.roof` on a centre post.
- **S2** (top 1.25): 4 legs, platform at 1.0; + cabin on the platform cyl r 0.24 h 0.22 seg 10 `cream` + cone roof
  r 0.34 h 0.3; + 2 `roundWindow`s; ladder full height.
- **S3** (top 1.45): + stone base `taperBox` 0.6 x 0.3 x 0.6 `stoneLight` that the legs stand on (legs shorten);
  + cabin windows become eyes: two `roundWindow` r 0.06 with a coal pupil box 0.03 shifted to look sideways
  (curious lookout); + spyglass (cyl r 0.02 h 0.16 `gold`, `rotX: PI/2`) poking out between them.
- **S4** (top 1.6): roof cone gets a `weathervaneRooster`; + alarm bell under the platform (sphere r 0.05 `gold`);
  + `miniChicken` on the platform rail; `banner` at the base. Remove the stone merlon ring (too castle-like).

### 3.18 Picket Fence (`wall`) - "twig wattle that becomes a white picket rampart"
Must stay 1.74 long on X, centred, and join seamlessly with neighbours (ends flush at x = +-0.87).
- **S0** (top 0.35): wattle: 5 posts cyl r 0.04 h 0.35 `timber` + 3 woven rails (cyl r 0.035 seg 6 lying along X,
  each slightly bowed by splitting into 2 halves with `rotZ +-0.03`) `timberLight` jitter 0.06.
- **S1** (top 0.45): white `picketFence` h 0.38 on both faces (front z 0.05 and back z -0.05), posts r 0.045 with
  sphere caps; low stone footing `roundBox` 1.74 x 0.08 x 0.26.
- **S2** (top 0.55): footing h 0.14 `stoneLight`; pickets h 0.42; central gate post pair cyl r 0.08 h 0.55
  `white` with `egg` finials (r 0.05).
- **S3** (top 0.7): + end posts x +-0.8 cyl r 0.09 h 0.6 `stoneLight` with `domeRoof(r 0.11, h 0.08, c.roof)`;
  pickets h 0.48; central gate posts h 0.7 with `c.roof` dome caps.
- **S4** (top 0.85): + small central perch box over the gate: plank platform box 0.4 x 0.04 x 0.3 on the gate
  posts with a `softGable` mini roof (len 0.4, wid 0.3, h 0.15) and a `miniChicken` guard; `banner` on it.
  Triangle cap 900 (walls repeat a lot).

### 3.19 Builder Hen's Shed (`builders`, stage 0 only) - "a shed wearing a giant hard hat"
- Shed `roundBox(-0.15, 0, -0.1, 0.62, 0.36, 0.5, timberLight)`; roof = hard hat: `domeRoof(-0.15, 0.36, -0.1,
  0.42, 0.3, FARM.mustard)` + brim cyl r 0.46 h 0.035 seg 12 `FARM.mustard` x0.85 + ridge band (box 0.06 x 0.04
  over the dome front-to-back) and a lamp (`lantern`) on the front of the hat. Eyes under the brim:
  `face(-0.15, 0.3, 0.16, 0.9, 'eyes')` (the shed peeks out from under its hat).
- `archDoor`; scaffold tower at (0.45, 0, -0.1) (keep, posts r 0.035 cyl instead of 0.05 boxes, planks 0.04);
  plank pile; `crate`; hammer sign as a big wooden hammer (handle cyl r 0.03 h 0.3, head `roundBox` 0.16 x 0.08 x
  0.08 `stoneDark`) leaning on the wall; one `miniChicken` with a tiny mustard hard hat (hemisphere r 0.045).
- Scaffold placeholder (`scaffold.ts`, not a stage): replace the `PAL.hay` cube with `roundBale`, round the
  posts, add an `egg` on the platform. Low priority.

---

## 4. QA checklist (for an independent reviewer)

Capture: `npx vite --port 5173`, then `tools/gallery.html?view=buildings-a`, `buildings-b`, `buildings-c`,
`halls`, `scaffold`, `close` (rows = levels 1 / 5 / 10, i.e. stages 0 / 2 / 4; check stages 1 and 3 by
temporarily adding levels 3 and 7 to the gallery `levels` array). Also rotate the camera 90/180/270 degrees once.

### 4.1 Readability at default zoom (`buildings-*` views)
- [ ] Each of the 19 buildings is identifiable by silhouette and dominant colour alone (squint test: blur the
  screenshot; no two buildings in the same row look alike).
- [ ] Each building shows at least one chicken/farm motif (egg, comb, nest, corn, hay, picket, weathervane) that
  is visible from the default camera (not hidden behind a roof).
- [ ] The roof (the biggest visible area) carries character: a ridge roll, comb, weathervane, dome or chimney.
- [ ] Faces appear only on the seven buildings in 1.5; eyes are dark squares with a white highlight; nothing else
  has eyes.
- [ ] No feature thinner than about 2 px that should show colour is swallowed by the outline (poles, rails,
  pennants show their colour, not just black).
- [ ] Team colour appears only as cloth (banners, pennants, stripes, shields). Accent override
  (`buildings-c` far right barracks with red banner / blue roof) still recolours the roof correctly.

### 4.2 Style match with units (`halls` view shows units and buildings together)
- [ ] Main masses look rounded or tapered (rounded edges visible on walls from stage 1); no plain-box walls.
- [ ] Every roof overhangs its walls on all visible sides and has a visible thickness band.
- [ ] Palette is muted: nothing brighter or more saturated than the chicken comb red and the gold.
- [ ] Big round forms (domes, silos, eggs, hay) shade in curved bands when `smooth` is used; boxes and roofs
  shade crisp.

### 4.3 Stage progression
- [ ] Stage N+1 is clearly bigger or richer than stage N for every building (compare side by side; a reviewer
  who does not know the level can sort shuffled stage screenshots correctly).
- [ ] Heights follow the table in 1.1 within +-0.1 (measure `geometry.boundingBox.max.y`).
- [ ] Stage 2 has a second volume; stage 3 has a stone plinth and a landmark; stage 4 has a team banner and
  gold; hall stage 5 is visibly golden.
- [ ] Footprint stays inside x, z in [-0.7, 0.7] (hall [-0.92, 0.92]; wall x [-0.87, 0.87]):
  check `boundingBox`.

### 4.4 Geometry hygiene
- [ ] No z-fighting: no shimmering stripes when the camera moves; decals and trims sit >= 0.01 proud.
- [ ] No floating parts: every part touches the ground or its support (check from the side, zoomed in).
- [ ] No parts clipping through roofs or walls where they should rest on them (signs, ladders, chimneys).
- [ ] Front faces +Z: door, face and signature details face the default camera.
- [ ] Damaged variant (`scaffold` view, damaged coop) puts its broken boards and smoke on the roof, not inside
  or above it (update `damage()` tops).
- [ ] Picket Fence segments join without gaps or overlaps when placed side by side.

### 4.5 Budget
- [ ] Triangles per building at max stage <= 1500 (hall stage 5 <= 1800, wall <= 900), excluding the outline
  hull. Measure with `geo.getAttribute('position').count / 3` for every (meshId, stage) and list the numbers in
  `docs/CHANGELOG.md`.
- [ ] Average over all 19 buildings at stage 4 <= 1100.
- [ ] Sphere detail never above 1; capsules at most 2 per building; `miniChicken`s at most 2 per building.
- [ ] `npm run typecheck`, `npm run lint`, tests green; gallery loads with no console errors.

---

## 5. Implementation order (suggested)
1. Parts P1 to P8 and P11, P13, P17, P19, P22 to P24, plus the `smooth` builder flag. Re-render the gallery.
2. Grand Coop and Chicken Coop (they set the bar), then economy (farm, lumber, quarry, mine, storehouse,
   tradingpost, market), then military (barracks, archery, stable, workshop, infirmary), then support (academy,
   tavern, tower, wall), then builders.
3. Run the QA checklist per file; record triangle counts and screenshots in the changelog.
