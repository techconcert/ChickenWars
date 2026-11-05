// Fog-of-war texture for the world scene: 0 unexplored, 128 explored, 255 visible (docs/03 art direction, world.md).
import * as THREE from 'three';
import { makeHexGrid, worldToCell } from '../../gen/hex';
import { bindFogOfWar, createFogTexture } from '../materials';
import type { HeightField } from '../../gen/terrain/fieldTypes';

export class FogLayer {
  private tex: ReturnType<typeof createFogTexture>;
  private cellOfTexel: Int32Array;
  private raw: Uint8Array;
  private tmp: Float32Array;
  private mid: Float32Array;
  readonly width: number;
  readonly height: number;
  readonly minX: number;
  readonly minZ: number;
  readonly sizeX: number;
  readonly sizeZ: number;
  private lastTick = -1e9;
  dirty = true;

  constructor(F: HeightField, private radius: number) {
    this.minX = F.x0;
    this.minZ = F.z0;
    this.sizeX = (F.GW - 1) * F.h;
    this.sizeZ = (F.GH - 1) * F.h;
    this.width = Math.ceil(this.sizeX / 0.8 / 4) * 4;
    this.height = Math.ceil(this.sizeZ / 0.8 / 4) * 4;
    this.tex = createFogTexture(this.width, this.height);
    this.tex.texture.unpackAlignment = 1;
    this.raw = new Uint8Array(this.width * this.height);
    this.tmp = new Float32Array(this.width * this.height);
    this.mid = new Float32Array(this.width * this.height);
    const g = makeHexGrid(radius);
    this.cellOfTexel = new Int32Array(this.width * this.height);
    for (let j = 0; j < this.height; j++) {
      for (let i = 0; i < this.width; i++) {
        const x = this.minX + ((i + 0.5) / this.width) * this.sizeX;
        const z = this.minZ + ((j + 0.5) / this.height) * this.sizeZ;
        this.cellOfTexel[j * this.width + i] = worldToCell(g, x, z);
      }
    }
  }

  bind(): void {
    bindFogOfWar(this.tex.texture, this.minX, this.minZ, this.sizeX, this.sizeZ);
  }

  get texture(): THREE.DataTexture {
    return this.tex.texture;
  }

  /** Refresh from `fog` (per cell 0/1/2) at most every 10 ticks unless forced. */
  update(fog: ArrayLike<number>, tick: number, force = false): boolean {
    if (!force && !this.dirty && tick - this.lastTick < 10) return false;
    this.lastTick = tick;
    this.dirty = false;
    const W = this.width;
    const H = this.height;
    const raw = this.raw;
    for (let t = 0; t < raw.length; t++) {
      const c = this.cellOfTexel[t]!;
      const f = c < 0 ? 2 : (fog[c] ?? 0);
      raw[t] = f >= 2 ? 255 : f === 1 ? 128 : 0;
    }
    // two separable box blurs (radius 2): organic, soft fog edges instead of hex staircases
    const tmp = this.tmp;
    const out = this.tex.data;
    let src: Uint8Array | Float32Array = raw;
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < H; j++) {
        for (let i = 0; i < W; i++) {
          const i0 = Math.max(0, i - 2);
          const i1 = Math.min(W - 1, i + 2);
          let s = 0;
          for (let a = i0; a <= i1; a++) s += src[j * W + a]!;
          tmp[j * W + i] = s / (i1 - i0 + 1);
        }
      }
      const dst: Uint8Array | Float32Array = pass === 1 ? out : this.mid;
      for (let j = 0; j < H; j++) {
        const j0 = Math.max(0, j - 2);
        const j1 = Math.min(H - 1, j + 2);
        for (let i = 0; i < W; i++) {
          let s = 0;
          for (let b = j0; b <= j1; b++) s += tmp[b * W + i]!;
          dst[j * W + i] = s / (j1 - j0 + 1);
        }
      }
      src = dst;
    }
    this.tex.texture.needsUpdate = true;
    return true;
  }

  dispose(): void {
    this.tex.texture.dispose();
  }
}
