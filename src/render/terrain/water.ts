// Water for the world scene: a circular sea (fades into the sky colour, fixing the prototype's square edge) driven by a
// per-sample depth texture, plus lake quads at their own water level.
import * as THREE from 'three';
import type { HeightField } from '../../gen/terrain/fieldTypes';
import { SEA } from '../../gen/terrain/types';
import { createWaterMaterial } from '../materials';
import { clamp } from '../view/util';

export interface WorldWater {
  group: THREE.Group;
  material: THREE.ShaderMaterial;
  depthTex: THREE.DataTexture;
  fadeRadius: number;
  dispose(): void;
}

export function buildWorldWater(F: HeightField): WorldWater {
  const data = new Uint8Array(F.n);
  for (let k = 0; k < F.n; k++) data[k] = Math.round(clamp((F.wl[k]! - F.H[k]! + 1) / 4, 0, 1) * 255);
  const depthTex = new THREE.DataTexture(data, F.GW, F.GH, THREE.RedFormat, THREE.UnsignedByteType);
  depthTex.unpackAlignment = 1;
  depthTex.minFilter = depthTex.magFilter = THREE.LinearFilter;
  depthTex.wrapS = depthTex.wrapT = THREE.ClampToEdgeWrapping;
  depthTex.needsUpdate = true;

  const cx = F.x0 + ((F.GW - 1) * F.h) / 2;
  const cz = F.z0 + ((F.GH - 1) * F.h) / 2;
  const half = Math.max(F.GW, F.GH) * F.h * 0.5;
  const fadeRadius = half * 1.05 + 24;
  const material = createWaterMaterial({
    depthTexture: depthTex,
    origin: new THREE.Vector2(F.x0, F.z0),
    step: F.h,
    dims: new THREE.Vector2(F.GW, F.GH),
    fadeRadius,
    fadeCentre: new THREE.Vector2(cx, cz),
  });
  const group = new THREE.Group();
  group.name = 'water';
  const sea = new THREE.Mesh(new THREE.CircleGeometry(fadeRadius * 1.02, 96), material);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(cx, SEA, cz);
  sea.renderOrder = 2;
  group.add(sea);

  // lakes and rivers: quads at the local water level
  const lp: number[] = [];
  for (let j = 0; j < F.GH - 1; j++) {
    for (let i = 0; i < F.GW - 1; i++) {
      const k = j * F.GW + i;
      const y = F.wl[k]!;
      if (Math.abs(y - SEA) < 1e-3 || y < F.H[k]! - 0.08) continue;
      const x = F.x0 + i * F.h;
      const z = F.z0 + j * F.h;
      const e = F.h;
      lp.push(x, y, z, x, y, z + e, x + e, y, z, x + e, y, z, x, y, z + e, x + e, y, z + e);
    }
  }
  let lakeGeo: THREE.BufferGeometry | null = null;
  if (lp.length) {
    lakeGeo = new THREE.BufferGeometry();
    lakeGeo.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    const lm = new THREE.Mesh(lakeGeo, material);
    lm.renderOrder = 3;
    lm.frustumCulled = false;
    group.add(lm);
  }
  return {
    group,
    material,
    depthTex,
    fadeRadius,
    dispose() {
      depthTex.dispose();
      material.dispose();
      sea.geometry.dispose();
      lakeGeo?.dispose();
    },
  };
}
