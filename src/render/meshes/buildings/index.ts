import * as THREE from 'three';
import { GeoBuilder, PAL, parseColour } from '../builder';
import { addOutline, getCelMaterial, getOutlineMaterial } from '../../materials';
import { FARM, smokePuff, type BuildCtx, type Gen } from './parts';
import { hall } from './hall';
import { builders, house } from './house';
import { farm, lumber, market, mine, quarry, storehouse, tradingpost } from './economy';
import { archery, barracks, infirmary, stable, workshop } from './military';
import { academy, tavern, tower, wall } from './support';
import { buildScaffoldMesh } from './scaffold';

export { buildScaffoldMesh };

export interface BuildingMeshOpts {
  /** Banner colour, `#rrggbb`. Default player blue. */
  banner?: string;
  /** Roof colour override, `#rrggbb`. */
  roofAccent?: string;
  damaged?: boolean;
  /** Use the fog-of-war aware material (world scene). */
  fogOfWar?: boolean;
}

export const BUILDING_MESH_IDS = [
  'hall', 'house', 'farm', 'lumber', 'quarry', 'mine', 'storehouse', 'barracks', 'archery',
  'stable', 'workshop', 'infirmary', 'academy', 'tavern', 'tower', 'wall', 'builders', 'market', 'tradingpost',
] as const;
export type BuildingMeshId = (typeof BUILDING_MESH_IDS)[number];

const GENS: Record<BuildingMeshId, Gen> = {
  hall, house, farm, lumber, quarry, mine, storehouse, barracks, archery, stable, workshop,
  infirmary, academy, tavern, tower, wall, builders, market, tradingpost,
};

/** Level -> visual stage. Hall: 1-4, 5-9, 10-14, 15-19, 20-24 (stages 0..4), 25 = gilded stage 5. Others: 1-2, 3-4, 5-6, 7-9, 10. */
export function levelStage(meshId: string, level: number): number {
  if (meshId === 'hall') return level >= 25 ? 5 : level >= 20 ? 4 : level >= 15 ? 3 : level >= 10 ? 2 : level >= 5 ? 1 : 0;
  if (meshId === 'builders') return 0;
  return level >= 10 ? 4 : level >= 7 ? 3 : level >= 5 ? 2 : level >= 3 ? 1 : 0;
}

/** Default roof colour per family (variety at a glance); `roofAccent` overrides. Every building reads its roof from `ctx.roof`. */
export const ROOF_DEFAULT: Record<BuildingMeshId, number> = {
  hall: 0x5a5a8c, house: PAL.roofRed, farm: FARM.barnRed, storehouse: FARM.barnRed,
  lumber: 0x9a5a38, quarry: 0x6f7a86, mine: 0x8a6a2a,
  tradingpost: FARM.terracotta, market: FARM.terracotta,
  barracks: 0x5f6d7c, archery: PAL.roofOrange, stable: PAL.roofOrange, workshop: 0x6a4a34,
  infirmary: 0x6fae8a, academy: 0x4a7fb8, tavern: PAL.roofOrange, tower: PAL.roofRed, wall: PAL.roofRed,
  builders: FARM.mustard,
};

/**
 * Top of the highest SOLID part (smoke excluded, flags / vanes included) per (mesh, stage), measured from the built
 * geometry (bbox max y). Reference table only: damage() re-measures the geometry it is given, so debris stays correct
 * even if a generator changes height.
 */
export const TOP_Y: Record<BuildingMeshId, number[]> = {
  hall: [1.33, 1.51, 1.52, 1.91, 2.05, 2.05],
  house: [0.71, 0.94, 1.15, 1.24, 1.46],
  farm: [0.27, 0.27, 0.7, 1.0, 1.2],
  lumber: [0.36, 0.65, 0.85, 1.03, 1.26],
  quarry: [0.42, 0.86, 0.96, 1.11, 1.24],
  mine: [0.45, 0.55, 0.8, 1.06, 1.24],
  storehouse: [0.65, 0.73, 0.95, 1.14, 1.36],
  tradingpost: [0.69, 0.66, 1.02, 1.16, 1.35],
  market: [0.6, 0.6, 0.91, 1.15, 1.32],
  barracks: [0.68, 0.88, 1.1, 1.22, 1.32],
  archery: [0.58, 0.74, 0.87, 1.06, 1.17],
  stable: [0.52, 0.77, 0.98, 1.08, 1.39],
  workshop: [0.58, 0.81, 1.13, 1.23, 1.29],
  infirmary: [0.67, 0.81, 1.07, 1.17, 1.23],
  academy: [0.93, 1.09, 1.25, 1.39, 1.55],
  tavern: [0.67, 0.83, 1.08, 1.18, 1.3],
  tower: [0.96, 1.29, 1.37, 1.42, 1.67],
  wall: [0.35, 0.54, 0.67, 0.78, 0.94],
  builders: [0.63],
};

const geoCache = new Map<string, THREE.BufferGeometry>();

export function buildBuildingGeometry(meshId: BuildingMeshId, level: number, opts: BuildingMeshOpts = {}): THREE.BufferGeometry {
  const stage = levelStage(meshId, level);
  const banner = parseColour(opts.banner, PAL.blue);
  const roof = parseColour(opts.roofAccent, ROOF_DEFAULT[meshId] ?? PAL.roofRed);
  const damaged = opts.damaged === true;
  const key = `${meshId}|${stage}|${banner}|${roof}|${damaged ? 1 : 0}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const b = new GeoBuilder(meshId.length * 31 + stage);
  const ctx: BuildCtx = { level, stage, banner, roof, damaged };
  GENS[meshId](b, ctx);
  if (damaged) damage(b, meshId, stage);
  const geo = b.build();
  if (damaged) darken(geo);
  geoCache.set(key, geo);
  return geo;
}

/** Measure the built-so-far geometry: highest non-smoke vertex (`max`) and the 97th percentile (`roof`, ignores flagpoles and vanes). */
function measureTop(b: GeoBuilder): { max: number; roof: number } {
  const g = b.build();
  const p = g.getAttribute('position'), c = g.getAttribute('color'), e = g.getAttribute('aEmit');
  const ys: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const em = e.getX(i);
    const grey = Math.abs(c.getX(i) - c.getY(i)) < 0.05 && Math.abs(c.getY(i) - c.getZ(i)) < 0.05;
    if (em > 0.05 && em < 0.15 && grey) continue; // smoke
    ys.push(p.getY(i));
  }
  g.dispose();
  ys.sort((a, z) => a - z);
  if (ys.length === 0) return { max: 0.5, roof: 0.5 };
  return { max: ys[ys.length - 1]!, roof: ys[Math.floor(ys.length * 0.97)]! };
}

function damage(b: GeoBuilder, meshId: BuildingMeshId, stage: number): void {
  // broken boards resting on the roof (or on the ground in front for low buildings) + a puff of smoke above it
  const tops = TOP_Y[meshId];
  const ref = tops[Math.min(stage, tops.length - 1)] ?? 0.9;
  const m = measureTop(b);
  const top = Number.isFinite(m.roof) && m.roof > 0.05 ? m.roof : ref;
  const ground = meshId === 'hall' ? 0.12 : 0; // the Grand Coop stands on a dais
  if (top - ground < 0.5) {
    // flat / low (fields, fences, pits, stalls): scatter the boards on the ground in front
    b.box(0.2, ground + 0.02, 0.5, 0.3, 0.06, 0.12, PAL.coal, { rotY: 0.5, rotZ: 0.12, jitter: 0 });
    b.box(-0.22, ground + 0.02, 0.45, 0.24, 0.05, 0.1, PAL.timberDark, { rotY: -0.7, rotZ: -0.1, jitter: 0 });
    b.box(0.0, ground + 0.07, 0.52, 0.2, 0.05, 0.08, PAL.timberDark, { rotY: 0.2, rotZ: 0.3, jitter: 0 });
  } else {
    // one board leaning at the roof front just under the top, one fallen on the ground in front
    b.box(0.16, top - 0.14, 0.2, 0.3, 0.07, 0.24, PAL.coal, { rotZ: 0.5, rotY: 0.4, jitter: 0 });
    b.box(-0.2, top - 0.3, 0.26, 0.22, 0.06, 0.2, PAL.timberDark, { rotZ: -0.7, rotY: -0.3, jitter: 0 });
    b.box(0.3, ground + 0.02, 0.6, 0.3, 0.06, 0.12, PAL.timberDark, { rotY: 0.6, rotZ: 0.12, jitter: 0 });
  }
  smokePuff(b, 0.05, top + 0.05, -0.05, 1.1);
}

function darken(geo: THREE.BufferGeometry): void {
  const c = geo.getAttribute('color');
  const em = geo.getAttribute('aEmit');
  for (let i = 0; i < c.count; i++) {
    if (em && em.getX(i) > 0.05 && em.getX(i) < 0.15) continue; // keep smoke grey
    c.setXYZ(i, c.getX(i) * 0.7, c.getY(i) * 0.66, c.getZ(i) * 0.64);
  }
}

/**
 * Cel-shaded, outlined building model on one hex footprint (circumradius 1, fits within ~0.85, height up to ~2.2).
 * The front faces +Z; rotate the group around Y to orient it. Geometry is cached per (mesh, stage, colours, damaged).
 */
export function buildBuildingMesh(meshId: string, level: number, opts: BuildingMeshOpts = {}): THREE.Group {
  const id = (BUILDING_MESH_IDS as readonly string[]).includes(meshId) ? (meshId as BuildingMeshId) : 'house';
  const geo = buildBuildingGeometry(id, level, opts);
  const mesh = new THREE.Mesh(geo, getCelMaterial({ fogOfWar: opts.fogOfWar }));
  mesh.name = `building:${id}`;
  const hull = new THREE.Mesh(geo, getOutlineMaterial(null, id === 'wall' ? 0.07 : 0.09, opts.fogOfWar));
  hull.name = 'outline';
  hull.userData['isOutline'] = true;
  hull.userData['thickness'] = id === 'wall' ? 0.07 : 0.09;
  hull.userData['colour'] = null;
  mesh.add(hull);
  const g = new THREE.Group();
  g.name = `building:${id}:L${level}`;
  g.userData['meshId'] = id;
  g.userData['stage'] = levelStage(id, level);
  g.userData['shared'] = true; // geometry is cached; do not dispose
  g.add(mesh);
  return g;
}

export { addOutline };
