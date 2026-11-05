// Chunked terrain geometry from the height field. Each chunk covers CS x CS samples (about 32 world units) and is built
// at stride 1, 2 or 4 (LOD). Chunk edges carry a short skirt so neighbouring strides never show cracks.
import * as THREE from 'three';
import type { HeightField } from '../../gen/terrain/fieldTypes';
import type { TerrainColourer } from './colour';

export const STRIDES = [1, 2, 4] as const;

export function chunkSamples(F: HeightField): number {
  return Math.max(8, Math.round(32 / F.h / 4) * 4);
}

const SKIRT = 1.1;

/** Build one chunk's geometry in world coordinates. */
export function buildChunkGeometry(F: HeightField, col: TerrainColourer, ci: number, cj: number, stride: number): THREE.BufferGeometry {
  const CS = chunkSamples(F);
  const { GW, GH, H, h } = F;
  const i0 = ci * CS;
  const j0 = cj * CS;
  const nx = Math.max(1, Math.floor((Math.min(i0 + CS, GW - 1) - i0) / stride));
  const nz = Math.max(1, Math.floor((Math.min(j0 + CS, GH - 1) - j0) / stride));
  const vw = nx + 1;
  const vh = nz + 1;
  const skirtVerts = 2 * (vw + vh);
  const nv = vw * vh + skirtVerts;
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const colr = new Float32Array(nv * 3);
  const at = (i: number, j: number): number => H[Math.min(GH - 1, Math.max(0, j)) * GW + Math.min(GW - 1, Math.max(0, i))]!;
  for (let b = 0; b < vh; b++) {
    for (let a = 0; a < vw; a++) {
      const i = Math.min(GW - 1, i0 + a * stride);
      const j = Math.min(GH - 1, j0 + b * stride);
      const v = b * vw + a;
      pos[v * 3] = F.x0 + i * h;
      pos[v * 3 + 1] = at(i, j);
      pos[v * 3 + 2] = F.z0 + j * h;
      const s = Math.max(1, Math.round(stride * 0.75));
      let gx = (at(i - s, j) - at(i + s, j)) / (2 * s * h);
      let gz = (at(i, j - s) - at(i, j + s)) / (2 * s * h);
      const l = Math.hypot(gx, 1, gz);
      gx /= l;
      gz /= l;
      nor[v * 3] = gx;
      nor[v * 3 + 1] = 1 / l;
      nor[v * 3 + 2] = gz;
      col.shade(i, j, 1 / l, colr, v * 3);
    }
  }
  const idx = new Uint16Array(nx * nz * 6 + 2 * (nx + nz) * 12);
  let q = 0;
  for (let b = 0; b < nz; b++) {
    for (let a = 0; a < nx; a++) {
      const p = b * vw + a;
      const r = p + 1;
      const s = p + vw;
      const t = s + 1;
      if ((a + b) & 1) { idx[q++] = p; idx[q++] = s; idx[q++] = r; idx[q++] = r; idx[q++] = s; idx[q++] = t; }
      else { idx[q++] = p; idx[q++] = t; idx[q++] = r; idx[q++] = p; idx[q++] = s; idx[q++] = t; }
    }
  }
  // skirts: duplicate the border ring lowered by SKIRT
  let sv = vw * vh;
  const ring: number[] = [];
  for (let a = 0; a < vw; a++) ring.push(a); // top (b = 0)
  for (let b = 1; b < vh; b++) ring.push(b * vw + vw - 1); // right
  for (let a = vw - 2; a >= 0; a--) ring.push((vh - 1) * vw + a); // bottom
  for (let b = vh - 2; b >= 1; b--) ring.push(b * vw); // left
  const first = sv;
  for (const v of ring) {
    pos[sv * 3] = pos[v * 3]!;
    pos[sv * 3 + 1] = pos[v * 3 + 1]! - SKIRT;
    pos[sv * 3 + 2] = pos[v * 3 + 2]!;
    nor.copyWithin(sv * 3, v * 3, v * 3 + 3);
    colr.copyWithin(sv * 3, v * 3, v * 3 + 3);
    sv++;
  }
  const m = ring.length;
  for (let r = 0; r < m; r++) {
    const a = ring[r]!;
    const b = ring[(r + 1) % m]!;
    const a2 = first + r;
    const b2 = first + ((r + 1) % m);
    idx[q++] = a; idx[q++] = b; idx[q++] = a2;
    idx[q++] = b; idx[q++] = b2; idx[q++] = a2;
    // reversed winding so the skirt is visible from either side
    idx[q++] = a; idx[q++] = a2; idx[q++] = b;
    idx[q++] = b; idx[q++] = a2; idx[q++] = b2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, sv * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, sv * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(colr.subarray(0, sv * 3), 3));
  g.setIndex(new THREE.BufferAttribute(idx.subarray(0, q), 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}
