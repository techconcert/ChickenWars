// Town life (D48): shared geometries + instanced batches for the ambient NPC chickens. About 11 draw calls in total.
import * as THREE from 'three';
import { GeoBuilder, PAL } from '../../meshes/builder';
import { CHICK_Y0, chickenBody, chickenLeg } from '../../meshes/chickens';
import { buildUnitMesh, type UnitClass } from '../../meshes/units';
import { getCelMaterial, getOutlineMaterial } from '../../materials';

/** Hip height the legs hang from (matches buildUnitMesh: shank 0.09 long under a body based at CHICK_Y0). */
export const HIP = 0.095;
export const LEG_X = 0.075;
const noRaycast = (): void => { /* ambient NPCs are never picked */ };

/** One InstancedMesh (plus optional inverted-hull outline sharing the same matrices) filled fresh each frame. */
export class Batch {
  readonly mesh: THREE.InstancedMesh;
  readonly outline: THREE.InstancedMesh | null;
  n = 0;
  constructor(readonly geo: THREE.BufferGeometry, readonly cap: number, outlineThickness: number | null, readonly coloured: boolean, readonly ownsGeo = true) {
    this.mesh = new THREE.InstancedMesh(geo, getCelMaterial(), cap);
    this.mesh.frustumCulled = false;
    this.mesh.raycast = noRaycast;
    this.mesh.count = 0;
    if (coloured) this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    if (outlineThickness !== null) {
      this.outline = new THREE.InstancedMesh(geo, getOutlineMaterial(null, outlineThickness), cap);
      this.outline.instanceMatrix = this.mesh.instanceMatrix;
      this.outline.frustumCulled = false;
      this.outline.raycast = noRaycast;
      this.outline.count = 0;
    } else this.outline = null;
  }
  reset(): void { this.n = 0; }
  push(m: THREE.Matrix4, r = 1, g = 1, b = 1): void {
    if (this.n >= this.cap) return;
    m.toArray(this.mesh.instanceMatrix.array as unknown as number[], this.n * 16);
    if (this.coloured) {
      const a = this.mesh.instanceColor!.array as unknown as number[];
      a[this.n * 3] = r; a[this.n * 3 + 1] = g; a[this.n * 3 + 2] = b;
    }
    this.n++;
  }
  flush(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = this.n > 0;
    if (this.coloured && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = this.n > 0;
    if (this.outline) this.outline.count = this.n;
  }
  addTo(g: THREE.Group): void { g.add(this.mesh); if (this.outline) g.add(this.outline); }
  dispose(): void { if (this.ownsGeo) this.geo.dispose(); }
}

function geo(f: (b: GeoBuilder) => void, seed: number): THREE.BufferGeometry {
  const b = new GeoBuilder(seed);
  b.ao = false;
  f(b);
  return b.build();
}

/** Prop origin = the hand grip; swing rotates around X (positive = forward / down). */
function bucketGeo(): THREE.BufferGeometry {
  return geo((b) => {
    b.cyl(0, -0.15, 0.02, 0.06, 0.045, 0.1, PAL.timberLight, 8, { jitter: 0.02 });
    b.cyl(0, -0.06, 0.02, 0.052, 0.052, 0.012, 0x6fb4d8, 8, { jitter: 0, emit: 0.2 });
    b.box(0, -0.05, 0.02, 0.1, 0.012, 0.012, PAL.stoneDark, { jitter: 0 });
  }, 31);
}
function axeGeo(): THREE.BufferGeometry {
  return geo((b) => {
    b.cyl(0, -0.05, 0, 0.012, 0.012, 0.34, PAL.timberLight, 5, { jitter: 0 });
    b.box(0, 0.22, 0.03, 0.02, 0.08, 0.1, PAL.stoneLight, { jitter: 0 });
  }, 32);
}
function hoeGeo(): THREE.BufferGeometry {
  return geo((b) => {
    b.cyl(0, -0.05, 0, 0.012, 0.012, 0.42, PAL.timberLight, 5, { jitter: 0 });
    b.box(0, 0.35, 0.04, 0.07, 0.02, 0.09, PAL.stoneDark, { jitter: 0 });
  }, 33);
}

export interface LifeMeshes {
  group: THREE.Group;
  body: Batch;
  inf: Batch;
  arch: Batch;
  cav: Batch;
  /** The pig's four legs (one batch, four instances per rider) with the game's limb offsets and phases. */
  cavLegs: Batch;
  cavLimbs: { x: number; y: number; z: number; phase: number; amp: number }[];
  legL: Batch;
  legR: Batch;
  props: Batch[]; // indexed by PROP id - 1: bucket, axe, hoe
  all: Batch[];
  dispose(): void;
}

/** Pulls the shared (cached) body geometry and limb layout out of the game's own unit mesh, so the patrols look like the army. */
function gameUnit(cls: UnitClass): { body: THREE.BufferGeometry; legs: THREE.BufferGeometry | null; limbs: { x: number; y: number; z: number; phase: number; amp: number }[] } {
  const g = buildUnitMesh(cls, '#3c6ea8', 'ram', 'chicken');
  const rig = g.userData['rig'] as THREE.Group;
  const meshes = rig.children.filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh);
  const limbs = (g.userData['limbs'] as { mesh: THREE.Mesh; phase: number; amp: number }[]).map((l) => ({ x: l.mesh.position.x, y: l.mesh.position.y, z: l.mesh.position.z, phase: l.phase, amp: l.amp }));
  return { body: meshes[0]!.geometry, legs: limbs.length ? (g.userData['limbs'] as { mesh: THREE.Mesh }[])[0]!.mesh.geometry : null, limbs };
}

export function buildLifeMeshes(cap: number): LifeMeshes {
  const group = new THREE.Group();
  group.name = 'town-life';
  const body = new Batch(geo((b) => chickenBody(b, PAL.blue, CHICK_Y0, 1), 21), cap, 0.04, true);
  const gi = gameUnit('infantry'), ga = gameUnit('archer'), gc = gameUnit('cavalry');
  const inf = new Batch(gi.body, cap, 0.04, false, false);
  const arch = new Batch(ga.body, cap, 0.04, false, false);
  const cav = new Batch(gc.body, cap, 0.04, false, false);
  const cavLegs = new Batch(gc.legs!, cap * 4, null, false, false);
  const lg = chickenLeg(0.09, 0.03).build();
  const legL = new Batch(lg, cap, null, false);
  const legR = new Batch(lg, cap, null, false);
  const props = [new Batch(bucketGeo(), cap, null, false), new Batch(axeGeo(), cap, null, false), new Batch(hoeGeo(), cap, null, false)];
  const all = [body, inf, arch, cav, cavLegs, legL, legR, ...props];
  for (const b of all) b.addTo(group);
  return {
    group, body, inf, arch, cav, cavLegs, cavLimbs: gc.limbs, legL, legR, props, all,
    dispose() {
      group.removeFromParent();
      const seen = new Set<THREE.BufferGeometry>();
      for (const b of all) { if (!seen.has(b.geo)) { seen.add(b.geo); b.dispose(); } b.mesh.dispose(); b.outline?.dispose(); }
    },
  };
}
