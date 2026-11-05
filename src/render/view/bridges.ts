// Island sea bridges on the world map: a plank deck with rails and piles per bridge cell run.
// Locked bridges are drawn as a pale translucent ghost, open ones as solid cel-shaded timber (decision D33).
import * as THREE from 'three';
import type { HexGrid } from '../../gen/hex';
import type { GameState } from '../../sim/state';
import { GeoBuilder, PAL } from '../meshes/builder';
import { getCelMaterial, getOutlineMaterial } from '../materials';

const DECK_Y = 0.16;

interface BridgeView { id: number; solid: THREE.Mesh; ghost: THREE.Mesh; open: boolean; cells: number[] }

export function buildBridgeGeometry(grid: HexGrid, cells: readonly number[], heightAt: (x: number, z: number) => number, isSea: (cell: number) => boolean = () => true): THREE.BufferGeometry {
  const set = new Set(cells);
  const b = new GeoBuilder(11);
  b.ao = false;
  const plank = [PAL.timberLight, 0xb98a58, PAL.timber];
  for (const c of cells) {
    const x = grid.x[c]!, z = grid.z[c]!;
    const y = Math.max(heightAt(x, z), 0.05) + DECK_Y;
    // deck plate (pointy hex, radius slightly under the cell) and cross planks
    b.plate(x, y - 0.06, z, 0.96, 0.08, PAL.timberDark, 6, { jitter: 0.02 });
    for (let i = -2; i <= 2; i++) {
      b.box(x, y + 0.02, z + i * 0.3, 1.5, 0.05, 0.24, plank[(i + 2 + (c % 3)) % 3]!, { jitter: 0.05 });
    }
    // piles under the deck
    for (const o of [-0.5, 0.5]) b.cyl(x + o, y - 0.62, z, 0.07, 0.08, 0.5, PAL.timberDark, 6, { jitter: 0 });
    // rails on edges that face open water (neighbours that are not part of the bridge and not walkable land)
    for (let k = 0; k < 6; k++) {
      const n = grid.nb[c * 6 + k]!;
      if (n < 0 || set.has(n) || !isSea(n)) continue;
      const nx = grid.x[n]!;
      const nz = grid.z[n]!;
      const dx = nx - x, dz = nz - z;
      const d = Math.hypot(dx, dz);
      if (d < 0.01) continue;
      const mx = x + dx * 0.47, mz = z + dz * 0.47;
      const ang = Math.atan2(-dx, -dz);
      b.box(mx, y + 0.05, mz, d / Math.sqrt(3) * 0.98, 0.05, 0.05, PAL.timberDark, { rotY: ang, jitter: 0 });
      b.box(mx, y + 0.05, mz, 0.06, 0.34, 0.06, PAL.timber, { jitter: 0 });
      b.box(mx, y + 0.3, mz, d / Math.sqrt(3) * 0.98, 0.05, 0.05, PAL.timberLight, { rotY: ang, jitter: 0 });
    }
  }
  return b.build();
}

export class BridgeLayer {
  readonly group = new THREE.Group();
  private views: BridgeView[] = [];
  private sig = '';

  constructor(private grid: HexGrid, private heightAt: (x: number, z: number) => number) {
    this.group.name = 'bridges';
  }

  /** Rebuild when the bridge set changes; cheap per-tick update of lock state and fog visibility. */
  sync(state: GameState): void {
    const br = state.world.bridges ?? [];
    if (this.views.length !== br.length) this.rebuild(state);
    const sig = br.map((b) => (b.unlocked ? 1 : 0)).join('') + '|' + this.visibleSig(state);
    if (sig === this.sig) return;
    this.sig = sig;
    for (let i = 0; i < br.length; i++) {
      const v = this.views[i];
      if (!v) continue;
      const seen = v.cells.some((c) => (state.world.fog[c] ?? 0) > 0);
      v.open = br[i]!.unlocked;
      v.solid.visible = seen && v.open;
      v.ghost.visible = seen && !v.open;
    }
  }

  private visibleSig(state: GameState): string {
    let s = '';
    for (const v of this.views) s += v.cells.some((c) => (state.world.fog[c] ?? 0) > 0) ? '1' : '0';
    return s;
  }

  private rebuild(state: GameState): void {
    this.clear();
    for (const b of state.world.bridges ?? []) {
      const geo = buildBridgeGeometry(this.grid, b.cells, this.heightAt, (n) => (state.world.regionOf[n] ?? -1) < 0);
      const solid = new THREE.Mesh(geo, getCelMaterial({ fogOfWar: true }));
      solid.name = `bridge:${b.id}`;
      const hull = new THREE.Mesh(geo, getOutlineMaterial(null, 0.06, true));
      hull.userData['isOutline'] = true;
      hull.userData['thickness'] = 0.06;
      hull.userData['colour'] = null;
      solid.add(hull);
      const ghost = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.34, depthWrite: false, fog: false }));
      ghost.name = `bridge-ghost:${b.id}`;
      ghost.renderOrder = 3;
      solid.visible = false;
      ghost.visible = false;
      this.group.add(solid, ghost);
      this.views.push({ id: b.id, solid, ghost, open: b.unlocked, cells: b.cells.slice() });
    }
    this.sig = '';
  }

  private clear(): void {
    for (const v of this.views) {
      this.group.remove(v.solid, v.ghost);
      v.solid.geometry.dispose();
      (v.ghost.material as THREE.Material).dispose();
    }
    this.views = [];
  }

  dispose(): void {
    this.clear();
    this.group.clear();
  }
}
