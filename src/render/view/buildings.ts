// Building view model (base scene): diffs state.city.buildings each tick and creates / updates / disposes meshes.
import * as THREE from 'three';
import { BUILDINGS } from '../../sim/data/registry';
import type { BuildingInstance, GameState } from '../../sim/state';
import { buildBuildingMesh, buildScaffoldMesh, setHover } from '../meshes';
import { getOutlineMaterial } from '../materials';

/** Town Hall is drawn larger than the other buildings so it reads as the centre of the town. */
export const HALL_SCALE = 1.3;
import { yawOf } from './util';
import { NBQ, NBR, SQ3 } from '../../gen/hex';

const badgeMats = new Map<number, THREE.SpriteMaterial>();
/** Shared round level badge (dark ring, parchment disc, bold number, 35% transparent); one material per level. */
function badgeMaterial(level: number): THREE.SpriteMaterial {
  let m = badgeMats.get(level);
  if (m) return m;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#2b2119';
  c.beginPath(); c.arc(32, 32, 30, 0, Math.PI * 2); c.fill();
  c.fillStyle = level >= 10 ? '#f1c85a' : '#f3e6c4';
  c.beginPath(); c.arc(32, 32, 25, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#2b2119';
  c.font = `bold ${level >= 10 ? 28 : 34}px sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(String(level), 32, 34);
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  m = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.65, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
  badgeMats.set(level, m);
  return m;
}

export interface BuildingView {
  id: string;
  type: string;
  cell: number;
  level: number;
  damaged: boolean;
  root: THREE.Group;
  body: THREE.Group | null;
  scaffold: THREE.Group | null;
  ring: THREE.Mesh | null;
  box: THREE.Box3;
  badge: THREE.Sprite | null;
  sig: string;
}

const AX_Y = (dx: number, dz: number): number => Math.atan2(-dz, dx);

function ringMesh(): THREE.Mesh {
  const g = new THREE.RingGeometry(0.8, 0.94, 40, 1, Math.PI / 2, -Math.PI * 2 * 0.5);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xe3b341, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false, fog: false }));
  m.position.y = 0.05;
  m.renderOrder = 5;
  return m;
}

export class BuildingViews {
  readonly group = new THREE.Group();
  readonly views = new Map<string, BuildingView>();
  private lastTick = -1;
  private hovered: string | null = null;
  private selected: string | null = null;

  constructor(private cellPos: (cell: number) => THREE.Vector3, private cellAt: (q: number, r: number) => number, private cellQR: (c: number) => [number, number]) {
    this.group.name = 'buildings';
  }

  private progressOf(state: GameState, id: string): { p: number; waiting: boolean } | null {
    const job = state.city.queue.find((j) => j.building === id);
    if (!job) return null;
    if (job.startTick === null) return { p: 0, waiting: true };
    return { p: Math.min(1, Math.max(0, (state.tick - job.startTick) / Math.max(1, job.ticks))), waiting: false };
  }

  /** Updates when the sim tick changed (or `force`). Returns ids created this call. */
  sync(state: GameState, force = false): string[] {
    if (!force && state.tick === this.lastTick) return [];
    this.lastTick = state.tick;
    const created: string[] = [];
    const seen = new Set<string>();
    const wallCells = new Set<number>();
    for (const b of Object.values(state.city.buildings)) if (b.type === 'wall') wallCells.add(b.cell);
    for (const b of Object.values(state.city.buildings)) {
      seen.add(b.id);
      let v = this.views.get(b.id);
      if (!v) {
        v = this.create(b);
        created.push(b.id);
      }
      this.update(v, b, state, wallCells);
    }
    for (const [id, v] of this.views) {
      if (seen.has(id)) continue;
      this.group.remove(v.root);
      v.scaffold?.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.parent?.userData['shared']) (o as THREE.Mesh).geometry?.dispose(); });
      this.views.delete(id);
    }
    return created;
  }

  private create(b: BuildingInstance): BuildingView {
    const root = new THREE.Group();
    root.name = `bld:${b.id}`;
    root.position.copy(this.cellPos(b.cell));
    this.group.add(root);
    const v: BuildingView = { id: b.id, type: b.type, cell: b.cell, level: -1, damaged: false, root, body: null, scaffold: null, ring: null, box: new THREE.Box3(), badge: null, sig: '' };
    this.views.set(b.id, v);
    return v;
  }

  private update(v: BuildingView, b: BuildingInstance, state: GameState, walls: Set<number>): void {
    if (v.cell !== b.cell) { v.cell = b.cell; v.root.position.copy(this.cellPos(b.cell)); v.level = -1; } // moved: reposition and refit the pick box
    const meshId = BUILDINGS[b.type]?.mesh ?? 'house';
    const prog = this.progressOf(state, b.id);
    if (v.level !== b.level || v.damaged !== b.damaged) {
      if (v.body) { this.setHoverOff(v); v.root.remove(v.body); }
      v.body = null;
      if (b.level > 0) {
        v.body = buildBuildingMesh(meshId, b.level, { damaged: b.damaged });
        if (meshId === 'hall') v.body.scale.setScalar(HALL_SCALE);
        v.root.add(v.body);
        if (this.selected === b.id) this.applySelected(v, true);
      }
      v.level = b.level;
      v.damaged = b.damaged;
      // level badge at the bottom right of the building (screen space: the sprite's centre is offset, so it holds when the camera turns)
      if (b.level > 0) {
        if (!v.badge) {
          v.badge = new THREE.Sprite(badgeMaterial(b.level));
          v.badge.renderOrder = 12;
          v.badge.name = 'level-badge';
          v.root.add(v.badge);
        }
        v.badge.material = badgeMaterial(b.level);
        // on the middle of the cell's bottom-right (south-east) side: half the way to the SE neighbour at (SQ3/2, 1.5)
        v.badge.scale.set(0.34, 0.34, 1);
        v.badge.center.set(0.5, 0.5);
        v.badge.position.set(SQ3 / 4, 0.18, 0.75);
      } else if (v.badge) { v.root.remove(v.badge); v.badge = null; }
      const h = meshId === 'hall' ? 3.4 : 2.3;
      const hw = meshId === 'hall' ? 1.05 : 0.8;
      const p = v.root.position;
      v.box.set(new THREE.Vector3(p.x - hw, p.y - 0.2, p.z - hw), new THREE.Vector3(p.x + hw, p.y + h, p.z + hw));
      // fit the pick box to the real mesh height so tall fixed boxes don't catch clicks on the ground behind
      if (v.body) {
        v.root.updateMatrixWorld(true);
        const mb = new THREE.Box3().setFromObject(v.body);
        if (Number.isFinite(mb.max.y)) v.box.max.y = Math.min(v.box.max.y, Math.max(mb.max.y + 0.1, p.y + 0.6));
      }
    }
    // scaffold: new building (level 0) gets the full scaffold; an upgrade only shows a progress ring
    if (prog && b.level === 0) {
      if (!v.scaffold) { v.scaffold = buildScaffoldMesh(prog.p); v.root.add(v.scaffold); }
      (v.scaffold.userData['setProgress'] as (p: number) => void)(prog.p);
    } else if (v.scaffold) {
      v.root.remove(v.scaffold);
      v.scaffold = null;
    }
    if (prog && b.level > 0 && !prog.waiting) {
      if (!v.ring) { v.ring = ringMesh(); v.root.add(v.ring); }
      v.ring.geometry.dispose();
      v.ring.geometry = new THREE.RingGeometry(0.8, 0.94, 40, 1, Math.PI / 2, -Math.PI * 2 * Math.max(0.01, prog.p)).rotateX(-Math.PI / 2);
    } else if (v.ring) {
      v.root.remove(v.ring);
      v.ring.geometry.dispose();
      v.ring = null;
    }
    // walls turn towards a neighbouring wall; other buildings face +Z
    if (b.type === 'wall') {
      const [q, r] = this.cellQR(b.cell);
      let yaw = 0;
      for (let k = 0; k < 6; k++) {
        const nc = this.cellAt(q + NBQ[k]!, r + NBR[k]!);
        if (nc >= 0 && walls.has(nc)) {
          const a = this.cellPos(nc);
          yaw = AX_Y(a.x - v.root.position.x, a.z - v.root.position.z);
          break;
        }
      }
      v.root.rotation.y = yaw;
    } else v.root.rotation.y = 0;
    if (v.badge) {
      // keep the badge on the cell's south-east side even when the root is turned (walls)
      const th = v.root.rotation.y, x = SQ3 / 4, z = 0.75;
      v.badge.position.set(x * Math.cos(th) - z * Math.sin(th), 0.18, x * Math.sin(th) + z * Math.cos(th));
    }
    void yawOf;
  }

  private setHoverOff(v: BuildingView): void {
    if (v.body) setHover(v.body, false);
  }

  setHovered(id: string | null): void {
    if (id === this.hovered) return;
    const old = this.hovered ? this.views.get(this.hovered) : undefined;
    if (old?.body) setHover(old.body, false);
    const nv = id ? this.views.get(id) : undefined;
    if (nv?.body) setHover(nv.body, true);
    this.hovered = id;
  }

  private applySelected(v: BuildingView, on: boolean): void {
    v.body?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !o.userData['isOutline']) return;
      if (on) {
        if (!o.userData['origHull']) o.userData['origHull'] = m.material;
        m.material = getOutlineMaterial(0xfff1c2, 0.1);
      } else if (o.userData['origHull']) {
        m.material = o.userData['origHull'] as THREE.Material;
        o.userData['origHull'] = undefined;
      }
    });
  }

  /** Selected building gets a light, thicker outline (plus the ground ring drawn by the scene). */
  setSelected(id: string | null): void {
    if (id === this.selected) return;
    const old = this.selected ? this.views.get(this.selected) : undefined;
    if (old) this.applySelected(old, false);
    const nv = id ? this.views.get(id) : undefined;
    if (nv) this.applySelected(nv, true);
    this.selected = id;
  }

  /** Pointer ray -> nearest building id. */
  pick(ray: THREE.Ray): string | null {
    let best: string | null = null;
    let bd = Infinity;
    const hit = new THREE.Vector3();
    for (const v of this.views.values()) {
      if (ray.intersectBox(v.box, hit)) {
        const d = hit.distanceTo(ray.origin);
        if (d < bd) { bd = d; best = v.id; }
      }
    }
    return best;
  }
}
