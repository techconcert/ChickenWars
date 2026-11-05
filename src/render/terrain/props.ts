// World props (rocks, trees, tufts) as one InstancedMesh per variant. Instance data is stored per chunk; each time the set
// of visible chunks changes the visible slices are copied into the (single) instance buffer of each variant, so draw calls
// stay at ~2 per variant whatever the map size and far chunks cost nothing.
import * as THREE from 'three';
import type { HeightField } from '../../gen/terrain/fieldTypes';
import type { Placements } from '../../gen/terrain/placeTypes';
import { getCelMaterial, getOutlineMaterial } from '../materials';
import { ensureSmoothNormals } from '../materials';
import { GeoBuilder, PAL, hexRGB } from '../meshes/builder';
import { makeOak, makePine, makeRockVariant, makeTuft } from '../meshes/props';
import type { Quality } from '../view/util';

interface Layer {
  geo: THREE.BufferGeometry;
  perChunk: Map<number, { m: Float32Array; c: Float32Array; cell: Int32Array }>;
  total: number;
  mesh: THREE.InstancedMesh | null;
  hull: THREE.InstancedMesh | null;
  thickness: number;
  /** active distance band as fractions of the prop radius */
  lo: number;
  radiusMul: number;
  thin: boolean;
  kind: 'rock' | 'tree' | 'other';
  tris: number;
}

function lowOak(variant: number): THREE.BufferGeometry {
  const b = new GeoBuilder(300 + variant);
  b.ao = false;
  b.cyl(0, 0, 0, 0.1, 0.15, 0.8, PAL.trunk, 5);
  b.sphere(0, 1.05, 0, 0.62, PAL.oak[1]!, { scale: [1, 0.88, 1] }, 0);
  b.sphere(0.3, 0.85, 0.1, 0.44, PAL.oak[0]!, { scale: [1, 0.88, 1] }, 0);
  b.sphere(-0.28, 1.35, 0.15, 0.42, PAL.oak[2]!, { scale: [1, 0.88, 1] }, 0);
  return b.build();
}

/** Prop chunk edge in world units: small chunks keep the distance bands and culling tight. */
const PROP_CHUNK = 12;

const RADIUS: Record<Quality, number> = { low: 24, medium: 40, high: 70 };

export class PropsLayer {
  readonly group = new THREE.Group();
  private layers: Layer[] = [];
  private cols: number;
  private rows: number;
  private CS: number;
  private sig = '';
  private frustum = new THREE.Frustum();
  private pv = new THREE.Matrix4();
  private box = new THREE.Box3();
  private quality: Quality = 'medium';
  instances = 0;
  /** triangles currently submitted by props (meshes + outline hulls) */
  triangles = 0;

  constructor(private F: HeightField, p: Placements, maxY: number, private cellOf: (x: number, z: number) => number) {
    this.group.name = 'props';
    this.CS = Math.max(8, Math.round(PROP_CHUNK / F.h));
    this.cols = Math.ceil((F.GW - 1) / this.CS);
    this.rows = Math.ceil((F.GH - 1) / this.CS);
    this.maxY = maxY;
    const cel = getCelMaterial({ fogOfWar: true });
    const m4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const AY = new THREE.Vector3(0, 1, 0);

    const rockGeos = [...Array(8)].map((_, i) => makeRockVariant(i));
    const rockFarGeos = [...Array(8)].map((_, i) => makeRockVariant(i, undefined, undefined, 0));
    const treeGeos: (THREE.BufferGeometry | null)[] = [makePine(0), makePine(1), makePine(2), makeOak(0), makeOak(1), makeOak(2), null, null, makePine(1, true), makePine(2, true)];
    const tuftGeo = makeTuft(0.28, hexRGB(PAL.meadow[1]!), hexRGB(0x8cc060));
    const reedGeo = makeTuft(0.7, hexRGB(0x6f8f46), hexRGB(0xa8b866));

    const mk = (geo: THREE.BufferGeometry, thickness: number, radiusMul: number, thin = false, lo = 0, kind: Layer['kind'] = 'other'): Layer => {
      const l: Layer = { geo, perChunk: new Map(), total: 0, mesh: null, hull: null, thickness, radiusMul, thin, lo, kind, tris: (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3 };
      this.layers.push(l);
      return l;
    };
    const rockL = rockGeos.map((g) => mk(g, 0.075, 0.4, false, 0, 'rock'));
    const rockFarL = rockFarGeos.map((g) => mk(g, 0, 1, false, 0.4, 'rock'));
    const treeL = treeGeos.map((g, i) => (g ? mk(g, 0.05, i >= 3 && i <= 5 ? 0.3 : 1, true, 0, 'tree') : null));
    // cheap low-poly oaks for the far band (same placements)
    const farOak = [0, 1, 2].map((v) => mk(lowOak(v), 0.05, 1, true, 0.3, 'tree'));
    const tuftL = mk(tuftGeo, 0, 0.4, true);
    const reedL = mk(reedGeo, 0, 0.4, true);
    const stoneL = mk(rockFarGeos[0]!, 0, 0.45, false, 0, 'rock');

    const add = (l: Layer, x: number, z: number, mat: THREE.Matrix4, tint: number): void => {
      const ci = Math.min(this.cols - 1, Math.max(0, Math.floor((x - F.x0) / F.h / this.CS)));
      const cj = Math.min(this.rows - 1, Math.max(0, Math.floor((z - F.z0) / F.h / this.CS)));
      const key = cj * this.cols + ci;
      let e = l.perChunk.get(key) as unknown as { m: number[]; c: number[]; cell: number[] } | undefined;
      if (!e) { e = { m: [], c: [], cell: [] }; l.perChunk.set(key, e as never); }
      e.cell.push(this.cellOf(x, z));
      e.m.push(...mat.elements);
      e.c.push(tint, tint * 0.99, tint);
      l.total++;
    };
    for (const r of p.rocks) {
      m4.compose(pos.set(r.x, r.y, r.z), q.set(r.qx, r.qy, r.qz, r.qw), sc.set(r.sx, r.sy, r.sz));
      add(rockL[r.variant % rockL.length]!, r.x, r.z, m4, r.tint);
      add(rockFarL[r.variant % rockFarL.length]!, r.x, r.z, m4, r.tint);
    }
    for (const t of p.trees) {
      const l = treeL[t.variant];
      if (!l) continue;
      if (t.variant >= 3 && t.variant <= 5) {
        m4.compose(pos.set(t.x, t.y, t.z), q.setFromAxisAngle(AY, t.rot), sc.set(t.scale, t.scale * (0.95 + 0.15 * ((t.rot * 13) % 1)), t.scale));
        add(farOak[t.variant - 3]!, t.x, t.z, m4, t.tint);
      }
      m4.compose(pos.set(t.x, t.y, t.z), q.setFromAxisAngle(AY, t.rot), sc.set(t.scale, t.scale * (0.95 + 0.15 * ((t.rot * 13) % 1)), t.scale));
      add(l, t.x, t.z, m4, t.tint);
    }
    for (const t of p.tufts) {
      m4.compose(pos.set(t.x, t.y, t.z), q.setFromAxisAngle(AY, t.rot), sc.set(t.scale, t.scale, t.scale));
      add(tuftL, t.x, t.z, m4, 0.9 + 0.2 * ((t.rot * 7) % 1));
    }
    for (const t of p.reeds) {
      m4.compose(pos.set(t.x, t.y, t.z), q.setFromAxisAngle(AY, t.rot), sc.set(t.scale, t.scale, t.scale));
      add(reedL, t.x, t.z, m4, 1);
    }
    for (const t of p.stones) {
      m4.compose(pos.set(t.x, t.y + t.scale * 0.05, t.z), q.setFromAxisAngle(AY, t.rot), sc.set(t.scale * 1.6, t.scale * 0.7, t.scale * 1.3));
      add(stoneL, t.x, t.z, m4, 1);
    }
    for (const l of this.layers) {
      // freeze per-chunk arrays
      for (const [k, e] of l.perChunk) {
        const raw = e as unknown as { m: number[]; c: number[]; cell: number[] };
        l.perChunk.set(k, { m: new Float32Array(raw.m), c: new Float32Array(raw.c), cell: new Int32Array(raw.cell) });
      }
      if (!l.total) continue;
      const mesh = new THREE.InstancedMesh(l.geo, cel, l.total);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(l.total * 3), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.group.add(mesh);
      l.mesh = mesh;
      if (l.thickness > 0) {
        ensureSmoothNormals(l.geo);
        const hull = new THREE.InstancedMesh(l.geo, getOutlineMaterial(null, l.thickness, true), l.total);
        hull.instanceMatrix = mesh.instanceMatrix;
        hull.frustumCulled = false;
        hull.count = 0;
        this.group.add(hull);
        l.hull = hull;
      }
    }
  }

  private maxY: number;

  /** Debug: per-layer instance counts and triangle cost. */
  breakdown(): { kind: string; tris: number; n: number; hull: number; cost: number }[] {
    return this.layers.filter((l) => l.mesh).map((l) => ({ kind: l.kind, tris: l.tris, n: l.mesh!.count, hull: l.hull?.count ?? 0, cost: (l.mesh!.count + (l.hull?.count ?? 0)) * l.tris }));
  }

  setQuality(q: Quality): void {
    this.quality = q;
    this.sig = '';
  }

  /** Debug toggles: hide rocks and/or trees (tufts and reeds follow `trees`). */
  setKinds(k: { rocks: boolean; trees: boolean }): void {
    this.kinds = k;
    this.sig = '';
  }
  private kinds = { rocks: true, trees: true };

  /** Recompute visible chunks (frustum + distance from the camera target) and refill the instance buffers on change. */
  update(camera: THREE.PerspectiveCamera, target: { x: number; z: number }, hidden: boolean, fog: ArrayLike<number> | null, fogVersion: number): void {
    this.group.visible = !hidden;
    if (hidden) { this.triangles = 0; return; }
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    const { F, CS } = this;
    const span = CS * F.h;
    const radius = RADIUS[this.quality];
    const vis: number[] = [];
    for (let cj = 0; cj < this.rows; cj++) {
      for (let ci = 0; ci < this.cols; ci++) {
        const x0 = F.x0 + ci * span;
        const z0 = F.z0 + cj * span;
        const cx = x0 + span / 2;
        const cz = z0 + span / 2;
        if (Math.hypot(cx - target.x, cz - target.z) - span * 0.7 > radius) continue;
        this.box.min.set(x0, -3, z0);
        this.box.max.set(x0 + span, this.maxY + 4, z0 + span);
        if (!this.frustum.intersectsBox(this.box)) continue;
        vis.push(cj * this.cols + ci);
      }
    }
    const cd = (key: number): number => { const ci = key % this.cols; const cj = (key - ci) / this.cols; return Math.hypot(F.x0 + (ci + 0.5) * span - target.x, F.z0 + (cj + 0.5) * span - target.z); };
    vis.sort((a, b) => cd(a) - cd(b));
    const sig = `${fogVersion}|${vis.join(',')}|${Math.round(target.x / 8)},${Math.round(target.z / 8)}`;
    if (sig === this.sig) return;
    this.sig = sig;
    let total = 0;
    let tris = 0;
    for (const l of this.layers) {
      if (!l.mesh) continue;
      if ((l.kind === 'rock' && !this.kinds.rocks) || (l.kind !== 'rock' && !this.kinds.trees)) { l.mesh.count = 0; if (l.hull) l.hull.count = 0; continue; }
      const ma = l.mesh.instanceMatrix.array as Float32Array;
      const ca = l.mesh.instanceColor!.array as Float32Array;
      let n = 0;
      let hullN = -1;
      const rmul = l.radiusMul;
      for (const key of vis) {
        const e = l.perChunk.get(key);
        if (!e) continue;
        const ci = key % this.cols;
        const cj = (key - ci) / this.cols;
        const d = Math.hypot(F.x0 + (ci + 0.5) * span - target.x, F.z0 + (cj + 0.5) * span - target.z) - span * 0.7;
        if (rmul < 1 && d > radius * rmul) continue;
        if (l.lo > 0 && d < radius * l.lo) continue;
        if (hullN < 0 && d > radius * 0.3) hullN = n;
        // thin out distant trees (keeps triangle count in budget)
        const step = l.thin ? (d < radius * 0.25 ? 1 : d < radius * 0.5 ? 2 : 4) : 1;
        const cnt = e.cell.length;
        for (let i = 0; i < cnt; i += step) {
          const cell = e.cell[i]!;
          if (fog && cell >= 0 && (fog[cell] ?? 0) === 0) continue;
          ma.set(e.m.subarray(i * 16, i * 16 + 16), n * 16);
          ca.set(e.c.subarray(i * 3, i * 3 + 3), n * 3);
          n++;
        }
      }
      l.mesh.count = n;
      if (l.hull) l.hull.count = hullN < 0 ? n : hullN;
      l.mesh.instanceMatrix.needsUpdate = true;
      l.mesh.instanceColor!.needsUpdate = true;
      total += n;
      tris += (n + (l.hull ? l.hull.count : 0)) * l.tris;
    }
    this.instances = total;
    this.triangles = tris;
  }

  dispose(): void {
    for (const l of this.layers) {
      l.mesh?.dispose();
      l.hull?.dispose();
    }
    for (const l of this.layers) l.geo.dispose();
    this.group.clear();
  }
}
