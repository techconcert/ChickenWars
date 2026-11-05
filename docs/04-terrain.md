# Terrain

Port of `prototypes/hex-island-poc/index.html` (read it, do not edit it). The hex grid is **logic only**. The visible ground is a separate fine height field. This document says what to keep, what to change, and how it plugs into the game.

## Pipeline (kept from prototype, section numbers refer to HANDOFF.md section 3)
1. `gen/terrain/regions.ts`: micro hex grid -> macro regions via jittered seeds + domain-warped nearest-seed; biome and terrace level per region; level 0 = beach. Maps to prototype `buildWorld`.
2. Clean-up: merge flat patches under 4 hexes; `repairLevels` keeps the walkable graph connected (regions linked when level difference is 0 or 1).
3. `gen/terrain/field.ts`: square grid (default 0.3 units/sample), domain-warped lookup of hex level, per-level SDFs (`chamfer`, `blurArr`, `sdfFromMask`), `height = sum STEP*smoothstep(sdf/width)`. Cliffs narrow, ramps wide soft capsules placed by union-find spanning tree over borders one level apart. Ramp slope verified and widened (max 5 passes). Maps to `buildField`.
4. `gen/terrain/contours.ts`: marching-squares polylines per level for rock placement (`extractContours`, `chainPoint`).
5. `render/terrain/mesh.ts`: terrain mesh + vertex colours (biome blur, slope -> rock strata, dirt on paths/ramps, snow on top levels). Maps to `buildTerrain`.
6. `render/props/*`: rocks (`placeRocks`), trees (`placeTrees`), tufts, props (`placeProps`), lakes, water.
7. `render/materials/cel.ts`, `outline.ts`, `water.ts`: `celMaterial`, `outlineMaterial`, `waterMaterial`.

Split pure maths (1 to 4, placement queries) into `src/gen` so it runs in a Web Worker and in Vitest. Only mesh/material code touches three.js. Replace the prototype's global state and DOM controls with parameters and a debug page.

## Changes required for the game
| # | Change | Why |
|---|---|---|
| T1 | Fix the known issues first (see HANDOFF section 4): readable ramps (side banks, rock edging, stronger slope tint), re-route/widen over-steep ramps instead of only reporting, circular sea fade, sharper cliff faces, plateau-reach for thin tops. | Explicit next steps from the handoff |
| T2 | Bigger world: support `NR` up to about 60 (default "Standard") with several islands/regions, chunked meshing and LOD. | A 4X needs more room than the 34-radius POC |
| T3 | Chunking: field and mesh in 32 x 32 unit chunks; far chunks sample at 2x or 4x stride; props culled by chunk and distance. | Frame budget (1.1M tris is too many) |
| T4 | Worker generation with progress callback; cache by (seed, options hash). | Responsiveness |
| T5 | Export a **logic layer** to sim: `cellId -> {region, level, biome, buildable, walkable, ramp?, lake?}`, region adjacency, ramp list with centrelines, and a coarse walkability/cost grid. The sim never reads the height field directly. | Keeps sim pure and testable |
| T6 | Query API for placement used by worldgen and render: `heightAt(x,z)`, `slopeAt`, `isWalkable`, `distanceToCliff`, `nearestRamp`. | Shared by nodes, camps, props |
| T7 | Biome set: meadow, forest, highland, snow, beach, plus a "swamp" and "badlands" later. Biome drives resources and props. | World variety |
| T8 | Start types change parameters: river (a carved low channel with fords), frozen north (snow baseline, shorter summer), islands (several land masses, bridges/ferries unlock). | Replayability |
| T9 | Season visuals: snow blend and leaf colour as uniforms, not regeneration. | Cheap seasons |
| T10 | Determinism: same seed + options -> identical logic layer (hashed in test). Height field floats need not be bit-identical across machines, but logic layer must be, so compute the logic layer with integer/hash noise only. | Saves and tests |

## Logic layer contract (T5)
```ts
interface TerrainLogic {
  seed: number; radius: number;
  cells: Int32Array;           // flat arrays indexed by cellIndex(q,r)
  regionOf: Uint16Array; level: Uint8Array; biome: Uint8Array;
  flags: Uint8Array;           // bit0 land, bit1 buildable, bit2 walkable, bit3 ramp, bit4 lake, bit5 coast
  regions: RegionInfo[];       // id, biome, level, centroid, cell count, neighbours, dangerTier (set by worldgen)
  ramps: { id: number; regionA: number; regionB: number; centre: [number, number][]; width: number }[];
  nav: { cost: Uint8Array };   // 0 = blocked, else cost per cell (1..9)
}
```
The sim imports only this interface (via `@gen/terrain/types`).

## Performance notes
Prototype: 240 ms generation, about 1.1M triangles including hulls at radius 34. Targets in `01-architecture.md` section 8. Levers: grid resolution, outline hull only on rocks/buildings/units (terrain uses a cheap screen-space or normal-edge pass), chunk LOD, instancing, rock counts.

## Tests
Several seeds: all land regions reachable; every ramp slope under limit (0.6); no flat patch under 4 hexes; generation time under budget; logic layer hash stable.
