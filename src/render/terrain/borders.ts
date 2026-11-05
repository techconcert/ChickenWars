// Region borders: dotted lines following the (warped) region boundaries in the height field, shown at world zoom.
import * as THREE from 'three';
import type { HeightField } from '../../gen/terrain/fieldTypes';
import { NO_REGION } from '../../gen/terrain/types';
import { circleTexture } from '../view/util';

const INK = [0.23, 0.18, 0.15];
const LOCKED = [0.62, 0.2, 0.18];

export class RegionBorders {
  readonly points: THREE.Points;
  private col: Float32Array;
  private pairs: Int32Array;
  private mat: THREE.PointsMaterial;

  constructor(F: HeightField, regionOfCell: ArrayLike<number>, heightAt: (x: number, z: number) => number) {
    const { GW, GH } = F;
    const pos: number[] = [];
    const pr: number[] = [];
    const step = 2;
    const reg = (k: number): number => {
      const r = regionOfCell[F.cellG[k]!] ?? NO_REGION;
      return r === NO_REGION || r < 0 ? -1 : r;
    };
    for (let j = 0; j < GH - step; j += step) {
      for (let i = 0; i < GW - step; i += step) {
        const k = j * GW + i;
        const a = reg(k);
        if (a < 0) continue;
        for (const nk of [k + step, k + step * GW]) {
          const b = reg(nk);
          if (b < 0 || b === a) continue;
          const x = F.x0 + (i + (nk === k + step ? step / 2 : 0)) * F.h;
          const z = F.z0 + (j + (nk === k + step ? 0 : step / 2)) * F.h;
          pos.push(x, heightAt(x, z) + 0.12, z);
          pr.push(a, b);
        }
      }
    }
    this.pairs = new Int32Array(pr);
    this.col = new Float32Array(pos.length);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.PointsMaterial({ size: 0.55, sizeAttenuation: true, vertexColors: true, map: circleTexture('hard'), transparent: true, opacity: 0, depthWrite: false, alphaTest: 0.05 });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    this.points.name = 'region-borders';
    this.recolour(() => false);
  }

  /** Border dots between a locked and any other region turn red-brown. */
  recolour(isLocked: (r: number) => boolean): void {
    for (let n = 0; n < this.pairs.length / 2; n++) {
      const lk = isLocked(this.pairs[n * 2]!) || isLocked(this.pairs[n * 2 + 1]!);
      const c = lk ? LOCKED : INK;
      this.col[n * 3] = c[0]!;
      this.col[n * 3 + 1] = c[1]!;
      this.col[n * 3 + 2] = c[2]!;
    }
    (this.points.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  setSize(s: number): void {
    this.mat.size = s;
  }

  setOpacity(o: number): void {
    this.mat.opacity = o;
    this.points.visible = o > 0.02;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}
