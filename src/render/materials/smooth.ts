import * as THREE from 'three';

/**
 * Position-welded smooth normals (port of the prototype's smoothNormals). Works on a triangle soup or, when `index`
 * is given, on indexed geometry. Used for outline hulls so hard-edged boxes inflate evenly instead of tearing open.
 */
export function smoothNormals(pos: ArrayLike<number>, index?: ArrayLike<number> | null): Float32Array {
  const nv = pos.length / 3;
  const slot = new Map<number, number>();
  const idx = new Int32Array(nv);
  for (let i = 0; i < nv; i++) {
    const kx = Math.round((pos[i * 3] ?? 0) * 100) + 6000;
    const ky = Math.round((pos[i * 3 + 1] ?? 0) * 100) + 1000;
    const kz = Math.round((pos[i * 3 + 2] ?? 0) * 100) + 6000;
    const k = (kx * 12001 + kz) * 2001 + ky;
    let s = slot.get(k);
    if (s === undefined) {
      s = slot.size;
      slot.set(k, s);
    }
    idx[i] = s;
  }
  const sum = new Float64Array(slot.size * 3);
  const nTri = index ? index.length / 3 : nv / 3;
  for (let t = 0; t < nTri; t++) {
    const a = index ? (index[t * 3] ?? 0) : t * 3;
    const b = index ? (index[t * 3 + 1] ?? 0) : t * 3 + 1;
    const c = index ? (index[t * 3 + 2] ?? 0) : t * 3 + 2;
    const ax = pos[a * 3] ?? 0, ay = pos[a * 3 + 1] ?? 0, az = pos[a * 3 + 2] ?? 0;
    const ux = (pos[b * 3] ?? 0) - ax, uy = (pos[b * 3 + 1] ?? 0) - ay, uz = (pos[b * 3 + 2] ?? 0) - az;
    const vx = (pos[c * 3] ?? 0) - ax, vy = (pos[c * 3 + 1] ?? 0) - ay, vz = (pos[c * 3 + 2] ?? 0) - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const q of [a, b, c]) {
      const s = (idx[q] ?? 0) * 3;
      sum[s] = (sum[s] ?? 0) + nx;
      sum[s + 1] = (sum[s + 1] ?? 0) + ny;
      sum[s + 2] = (sum[s + 2] ?? 0) + nz;
    }
  }
  const out = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    const s = (idx[i] ?? 0) * 3;
    const x = sum[s] ?? 0, y = sum[s + 1] ?? 0, z = sum[s + 2] ?? 0;
    const l = Math.hypot(x, y, z) || 1;
    out[i * 3] = x / l;
    out[i * 3 + 1] = y / l;
    out[i * 3 + 2] = z / l;
  }
  return out;
}

/** Adds the `aSmooth` attribute used by outline hulls (no-op when present). */
export function ensureSmoothNormals(geo: THREE.BufferGeometry): void {
  if (geo.getAttribute('aSmooth')) return;
  const p = geo.getAttribute('position');
  geo.setAttribute('aSmooth', new THREE.BufferAttribute(smoothNormals(p.array, geo.index?.array ?? null), 3));
}
