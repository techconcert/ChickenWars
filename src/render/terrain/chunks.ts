// Chunk manager: one mesh per 32x32 unit chunk, lazily rebuilt at stride 1 / 2 / 4 by camera distance.
import * as THREE from 'three';
import type { HeightField } from '../../gen/terrain/fieldTypes';
import { getCelMaterial } from '../materials';
import type { TerrainColourer } from './colour';
import { buildChunkGeometry, chunkSamples } from './mesh';
import type { Quality } from '../view/util';

interface Chunk {
  ci: number;
  cj: number;
  centre: THREE.Vector3;
  radius: number;
  mesh: THREE.Mesh | null;
  stride: number;
  /** stride the chunk should have (set by update) */
  want: number;
}

/** Distance thresholds [stride 1 up to, stride 2 up to] per quality. */
const LOD: Record<Quality, [number, number]> = { low: [12, 40], medium: [20, 56], high: [55, 140] };

export class TerrainChunks {
  readonly group = new THREE.Group();
  readonly cols: number;
  readonly rows: number;
  readonly chunks: Chunk[] = [];
  readonly CS: number;
  private material = getCelMaterial({ fogOfWar: true, terrain: true });
  private quality: Quality = 'medium';
  triangles = 0;

  constructor(readonly F: HeightField, private colourer: TerrainColourer) {
    this.group.name = 'terrain';
    this.CS = chunkSamples(F);
    this.cols = Math.ceil((F.GW - 1) / this.CS);
    this.rows = Math.ceil((F.GH - 1) / this.CS);
    for (let cj = 0; cj < this.rows; cj++) {
      for (let ci = 0; ci < this.cols; ci++) {
        const x0 = F.x0 + ci * this.CS * F.h;
        const z0 = F.z0 + cj * this.CS * F.h;
        const w = Math.min(this.CS, F.GW - 1 - ci * this.CS) * F.h;
        const d = Math.min(this.CS, F.GH - 1 - cj * this.CS) * F.h;
        this.chunks.push({ ci, cj, centre: new THREE.Vector3(x0 + w / 2, 0, z0 + d / 2), radius: Math.hypot(w, d) / 2, mesh: null, stride: 0, want: 4 });
      }
    }
    // everything visible immediately at the coarsest stride (cheap), refined lazily
    for (const c of this.chunks) this.build(c, 4);
  }

  setQuality(q: Quality): void {
    this.quality = q;
  }

  private build(c: Chunk, stride: number): void {
    const geo = buildChunkGeometry(this.F, this.colourer, c.ci, c.cj, stride);
    if (c.mesh) {
      c.mesh.geometry.dispose();
      c.mesh.geometry = geo;
    } else {
      const m = new THREE.Mesh(geo, this.material);
      m.name = `chunk:${c.ci},${c.cj}`;
      m.matrixAutoUpdate = false;
      this.group.add(m);
      c.mesh = m;
    }
    c.stride = stride;
  }

  /** Mark every chunk for a colour rebuild (e.g. a region unlocked). */
  invalidateColours(): void {
    for (const c of this.chunks) c.stride = -c.stride;
  }

  /** Choose strides by camera distance and rebuild up to `budgetMs` worth of chunks (nearest first). */
  update(camPos: THREE.Vector3, budgetMs = 4): void {
    const [t1, t2] = LOD[this.quality];
    const todo: Chunk[] = [];
    let tris = 0;
    for (const c of this.chunks) {
      const d = Math.hypot(camPos.x - c.centre.x, camPos.z - c.centre.z, camPos.y) - c.radius;
      const cur = Math.abs(c.stride);
      const hyst = cur === 1 ? 1.12 : cur === 2 ? 1.08 : 1;
      const want = d < t1 * (cur === 1 ? hyst : 1) ? 1 : d < t2 * (cur <= 2 ? hyst : 1) ? 2 : 4;
      c.want = want;
      if (want !== cur || c.stride < 0) todo.push(c);
      else {
        const verts = ((this.CS / cur) + 1) ** 2;
        tris += verts * 2;
      }
    }
    if (todo.length) {
      todo.sort((a, b) => a.centre.distanceToSquared(camPos) - b.centre.distanceToSquared(camPos));
      const t0 = performance.now();
      for (const c of todo) {
        this.build(c, c.want);
        if (performance.now() - t0 > budgetMs) break;
      }
    }
    this.triangles = tris;
  }

  dispose(): void {
    for (const c of this.chunks) c.mesh?.geometry.dispose();
    this.group.clear();
  }
}
