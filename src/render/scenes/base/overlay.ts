// Base scene overlays: faint hex grid inside territory, territory boundary ribbon, placement validity tint, hover ring.
import * as THREE from 'three';
import type { HexGrid } from '../../../gen/hex';
import type { GameState } from '../../../sim/state';
import { inTerritory, placementError, territoryRadius } from '../../../sim/city/territory';
import { edgeCorners } from '../../view/util';

type Hf = (x: number, z: number) => number;

export class BaseOverlay {
  readonly group = new THREE.Group();
  private grid: THREE.LineSegments | null = null;
  private ring: THREE.Mesh | null = null;
  private tint: THREE.Mesh | null = null;
  private tintCol: THREE.BufferAttribute | null = null;
  private sig = '';
  private tintSig = '';
  private cells: number[] = [];
  private lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false });
  private ringMat = new THREE.MeshBasicMaterial({ color: 0xe3b341, transparent: true, opacity: 0.8, depthWrite: false, fog: false, side: THREE.DoubleSide });
  private tintMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.34, depthWrite: false, fog: false, side: THREE.DoubleSide });
  private hoverRing: THREE.Mesh;

  constructor(private g: HexGrid, private heightAt: Hf) {
    this.group.name = 'base-overlay';
    const rg = new THREE.RingGeometry(0.8, 0.95, 6);
    rg.rotateX(-Math.PI / 2);
    rg.rotateY(Math.PI / 6);
    this.hoverRing = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
    this.hoverRing.visible = false;
    this.hoverRing.renderOrder = 5;
    this.group.add(this.hoverRing);
  }

  setHover(cell: number, colour: number | null): void {
    if (cell < 0 || colour === null) { this.hoverRing.visible = false; return; }
    this.hoverRing.visible = true;
    this.hoverRing.position.set(this.g.x[cell]!, this.heightAt(this.g.x[cell]!, this.g.z[cell]!) + 0.08, this.g.z[cell]!);
    (this.hoverRing.material as THREE.MeshBasicMaterial).color.setHex(colour);
  }

  /** Rebuild grid + boundary when the territory changes; tint cells for `placing` (null clears). */
  update(state: GameState, placing: string | null): void {
    const th = state.city.buildings[state.city.townHall];
    const rad = territoryRadius(state);
    const sig = `${th?.cell}|${rad}`;
    if (sig !== this.sig) {
      this.sig = sig;
      this.cells = [];
      for (let c = 0; c < this.g.count; c++) if (inTerritory(state, c)) this.cells.push(c);
      this.rebuildGrid();
      this.tintSig = '';
    }
    this.lineMat.opacity = placing ? 0.42 : 0.16;
    const tsig = placing ? `${placing}|${state.tick >> 3}|${Object.keys(state.city.buildings).length}` : '';
    if (tsig !== this.tintSig) {
      this.tintSig = tsig;
      this.rebuildTint(state, placing);
    }
  }

  private rebuildGrid(): void {
    this.grid?.geometry.dispose();
    this.ring?.geometry.dispose();
    if (this.grid) this.group.remove(this.grid);
    if (this.ring) this.group.remove(this.ring);
    const inSet = new Set(this.cells);
    const lp: number[] = [];
    const rp: number[] = [];
    const ri: number[] = [];
    const y = (x: number, z: number): number => this.heightAt(x, z);
    for (const c of this.cells) {
      const cx = this.g.x[c]!, cz = this.g.z[c]!;
      for (let k = 0; k < 6; k++) {
        const [ax, az, bx, bz] = edgeCorners(k);
        const nb = this.g.nb[c * 6 + k]!;
        const border = nb < 0 || !inSet.has(nb);
        if (!border && nb < c) continue;
        const pts: number[] = [];
        for (let s = 0; s <= 3; s++) {
          const x = cx + ax + (bx - ax) * (s / 3), z = cz + az + (bz - az) * (s / 3);
          pts.push(x, y(x, z) + 0.07, z);
        }
        for (let s = 0; s < 3; s++) lp.push(pts[s * 3]!, pts[s * 3 + 1]!, pts[s * 3 + 2]!, pts[s * 3 + 3]!, pts[s * 3 + 4]!, pts[s * 3 + 5]!);
        if (border) {
          // ribbon of width 0.14 pointing outwards
          const ox = Math.cos((60 * k * Math.PI) / 180), oz = Math.sin((60 * k * Math.PI) / 180);
          const base = rp.length / 3;
          for (let s = 0; s <= 3; s++) {
            const px = pts[s * 3]!, pz = pts[s * 3 + 2]!, py = pts[s * 3 + 1]! + 0.02;
            rp.push(px - ox * 0.07, py, pz - oz * 0.07, px + ox * 0.07, py, pz + oz * 0.07);
          }
          for (let s = 0; s < 3; s++) {
            const a = base + s * 2;
            ri.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
          }
        }
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    this.grid = new THREE.LineSegments(lg, this.lineMat);
    this.grid.frustumCulled = false;
    this.grid.renderOrder = 4;
    this.group.add(this.grid);
    const rgeo = new THREE.BufferGeometry();
    rgeo.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    rgeo.setIndex(ri);
    this.ring = new THREE.Mesh(rgeo, this.ringMat);
    this.ring.frustumCulled = false;
    this.ring.renderOrder = 4;
    this.group.add(this.ring);
  }

  private rebuildTint(state: GameState, placing: string | null): void {
    if (this.tint) { this.group.remove(this.tint); this.tint.geometry.dispose(); this.tint = null; }
    if (!placing) return;
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    for (const c of this.cells) {
      const err = placementError(state, placing, c);
      if (err === 'occupied' || err === 'terrain') continue;
      const rgb = err ? [0.85, 0.25, 0.2] : [0.3, 0.85, 0.3];
      const cx = this.g.x[c]!, cz = this.g.z[c]!;
      const b = pos.length / 3;
      pos.push(cx, this.heightAt(cx, cz) + 0.06, cz);
      col.push(rgb[0]!, rgb[1]!, rgb[2]!);
      for (let k = 0; k < 6; k++) {
        const a = ((60 * k - 30) * Math.PI) / 180;
        const x = cx + Math.cos(a) * 0.92, z = cz + Math.sin(a) * 0.92;
        pos.push(x, this.heightAt(x, z) + 0.06, z);
        col.push(rgb[0]!, rgb[1]!, rgb[2]!);
        idx.push(b, b + 1 + k, b + 1 + ((k + 1) % 6));
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    this.tint = new THREE.Mesh(geo, this.tintMat);
    this.tint.frustumCulled = false;
    this.tint.renderOrder = 3;
    this.group.add(this.tint);
  }

  dispose(): void {
    this.grid?.geometry.dispose();
    this.ring?.geometry.dispose();
    this.tint?.geometry.dispose();
    this.lineMat.dispose(); this.ringMat.dispose(); this.tintMat.dispose();
  }
}
