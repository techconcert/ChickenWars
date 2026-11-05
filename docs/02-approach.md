# Approach

## Build strategy: vertical slices, sim first
Each milestone delivers something playable and tested, not a layer. Order of work inside a milestone:
1. Data and types (schemas + JSON).
2. Sim logic with unit tests.
3. Minimal render representation (boxes, debug colours) so it can be seen.
4. UI panel.
5. Polish pass (cel look, juice) only in the dedicated polish milestone, except where readability needs it.

Never build rendering polish for a system whose sim is not tested.

## Procedural assets
- **Terrain:** port the prototype's logic-hex + height-field + SDF + ramp approach (`04-terrain.md`).
- **Buildings:** parametric generators. A building is a recipe: footprint, base block, roof type, optional chimney/tower/flag, a palette, and per-level add-ons (extra floors, banners). Built from merged boxes, prisms, cylinders, cones with flat vertex colours. One generator per family (`house`, `workshop`, `barracks`, `tower`, `hall`, `farm`, `mill`, `quarry`, `wall`).
- **Units:** chunky low-poly chibi figures (capsule body, sphere head, simple limbs) by troop type with a tint per faction. Marches show 3 to 7 units standing in for the army size.
- **Props:** pines, oaks, tufts, rocks (already in prototype), crates, fences, banners, tents.
- **Icons:** drawn at runtime to canvas from simple vector recipes (circle/rect/polygon plus a symbol glyph), cached as data URLs. No image files.
- **Audio:** WebAudio synthesis (envelopes, noise bursts, a short pentatonic music loop). Optional and muted by default until the user interacts.
- **UI font:** system font stack. No webfonts.

## Content authoring flow
Add JSON -> `npm run validate` -> appears in game automatically through registries. Code changes are needed only for new mechanics (new effect type, new target kind).

## Balancing
- All numbers in `data/`. Global tuning knobs in `data/balance.json` (gather rates, upkeep multiplier, raid strength curve, offline cap).
- Use `tools/balance-sim.ts` to simulate a scripted opening and print time-to-milestones. Targets are in `ROADMAP.md`.
- Pacing target: a session of 30 to 60 minutes gets a new player through Grand Coop 5 and the first region boss.

## Definition of done (per milestone)
- Acceptance checklist in `ROADMAP.md` ticked, each item verifiable.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run validate` all pass.
- Determinism and save round-trip tests still pass.
- No file over ~500 lines; no TODOs without an entry in `docs/BACKLOG.md`.
- `docs/CHANGELOG.md` updated with what changed, how it was verified, and known issues.
- Decisions that changed are recorded in `05-decisions.md`.

## Risk list and mitigations
| Risk | Mitigation |
|---|---|
| Terrain generation slow or janky | Worker, chunked meshing, resolution knob, measure in M1 |
| Pathfinding on rough terrain looks wrong | Nav graph on micro hexes with ramp-aware edges; march visuals follow height field |
| Scope explosion | Milestones are ordered; polish and extra content are last; BACKLOG for ideas |
| Balance spiral | Data-driven, balance bot, conservative defaults |
| Procedural art looks cheap | Strong palette discipline, outlines, props density, cel bands, lighting per season |
| Sim/render coupling creep | ESLint boundaries, view-model layer, determinism tests |

## Agent working rules recap
Follow `CLAUDE.md`. When unsure, choose the simplest option, record it, move on. Ask the user only for items that change player-visible design (use `06-open-questions.md`).
