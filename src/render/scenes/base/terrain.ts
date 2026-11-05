// Base (city) scene ground: coloured plateau mesh from the base height field, pond + sea water, props on forest/rock cells.
import * as THREE from 'three';
import { SQ3, makeHexGrid, worldToCell, type HexGrid } from '../../../gen/hex';
import { BASE_CLIFF, BASE_FOREST, BASE_GRASS, BASE_ROCK, BASE_WATER, buildBaseHeightField, type BaseHeightField } from '../../../gen/base/layout';
import { hash3i, makeNoise } from '../../../gen/noise';
import { blurArr } from '../../../gen/terrain/sdf';
import { createWaterMaterial, getCelMaterial } from '../../materials';
import { PAL, hexRGB, mixRGB, mulRGB, type RGB } from '../../meshes/builder';
import { makeLilyPad, makeReeds } from '../../meshes/pondProps';
import { makeInstanced, makeOak, makePine, makeRockVariant, makeTuft, type InstanceXform } from '../../meshes';
import { clamp, smooth } from '../../view/util';

export interface BaseGround {
  hf: BaseHeightField;
  grid: HexGrid;
  group: THREE.Group;
  seaY: number;
  dispose(): void;
}

const SAND = hexRGB(PAL.sand);
const TEAL = hexRGB(0x5f9fa8);
const ROCK = PAL.boulder.map(hexRGB) as [RGB, RGB, RGB];
const GRASS = PAL.meadow.map(hexRGB) as [RGB, RGB, RGB];
const FOREST_FLOOR = mixRGB(GRASS[0], hexRGB(0x3f6a40), 0.55);
const SEA_LEVEL = -1.25;
/** blurred pond mask above which a vertex belongs to the pond basin (shared by the ground tint, depth texture and water mesh) */
const POND_M = 0.2;
const MUD = hexRGB(0xb59a64);
const BED = hexRGB(0x5f8f86);

export function buildBaseGround(terrain: number[], radius: number, seed: number): BaseGround {
  const hf = buildBaseHeightField(terrain, radius, seed);
  const grid = makeHexGrid(radius);
  const { GW, GH, x0, z0, h, H } = hf;
  const n = GW * GH;
  const noise = makeNoise(seed ^ 0x2545f491);
  const cn = makeNoise(seed ^ 0x77aa);
  const mForest = new Float32Array(n);
  const mRock = new Float32Array(n);
  const mPond = new Float32Array(n);
  for (let j = 0; j < GH; j++) {
    for (let i = 0; i < GW; i++) {
      const x = x0 + i * h;
      const z = z0 + j * h;
      const wx = x + 0.35 * noise.n2(x * 0.3, z * 0.3);
      const wz = z + 0.35 * noise.n2(x * 0.3 + 9, z * 0.3 + 4);
      const c = worldToCell(grid, wx, wz);
      const t = c < 0 ? BASE_CLIFF : terrain[c]!;
      const k = j * GW + i;
      mForest[k] = t === BASE_FOREST ? 1 : 0;
      mRock[k] = t === BASE_ROCK ? 1 : 0;
      mPond[k] = t === BASE_WATER ? 1 : 0;
    }
  }
  blurArr(mForest, GW, GH, 2, 2);
  blurArr(mRock, GW, GH, 2, 2);
  blurArr(mPond, GW, GH, 2, 2);

  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const at = (i: number, j: number): number => H[clamp(j, 0, GH - 1) * GW + clamp(i, 0, GW - 1)]!;
  for (let j = 0; j < GH; j++) {
    for (let i = 0; i < GW; i++) {
      const k = j * GW + i;
      const x = x0 + i * h;
      const z = z0 + j * h;
      const y = H[k]!;
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      let gx = (at(i - 1, j) - at(i + 1, j)) / (2 * h);
      let gz = (at(i, j - 1) - at(i, j + 1)) / (2 * h);
      const l = Math.hypot(gx, 1, gz);
      gx /= l; gz /= l;
      const ny = 1 / l;
      nor[k * 3] = gx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = gz;
      const pa = cn.n2(x * 0.08 + 13, z * 0.08);
      const pb = cn.n2(x * 0.3, z * 0.3 + 4);
      let c: RGB = mixRGB(GRASS[1], GRASS[pa > 0 ? 2 : 0], Math.abs(pa) * 0.7);
      c = mulRGB(c, 1 + 0.05 * pb);
      c = mixRGB(c, FOREST_FLOOR, smooth(0.25, 0.7, mForest[k]!));
      c = mixRGB(c, mixRGB(ROCK[0], GRASS[0], 0.3), smooth(0.25, 0.7, mRock[k]!));
      const under = smooth(SEA_LEVEL + 0.2, -2.4, y);
      if (y < SEA_LEVEL + 0.5) c = mixRGB(c, mixRGB(SAND, TEAL, under * 0.9), smooth(SEA_LEVEL + 0.5, SEA_LEVEL - 0.1, y));
      // wet shore: muddy sand ring blending into a teal bed, so the basin reads as carved instead of a grey dirt pit
      const wet = smooth(0.06, 0.4, mPond[k]!);
      if (wet > 0) {
        c = mixRGB(c, MUD, wet * 0.5);
        c = mixRGB(c, BED, smooth(hf.pondY + 0.02, hf.pondY - 0.35, y) * wet);
      }
      const rk = (1 - smooth(0.5, 0.82, ny)) * (y > SEA_LEVEL - 0.6 ? 1 : 0.4) * (1 - wet);
      if (rk > 0) {
        const st = 0.5 + 0.5 * Math.sin(y * 7 + pb * 2.5);
        c = mixRGB(c, mulRGB(mixRGB(ROCK[0], ROCK[2], st * 0.8), 0.85), rk);
      }
      col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
    }
  }
  const idx = new Uint32Array((GW - 1) * (GH - 1) * 6);
  let q = 0;
  for (let j = 0; j < GH - 1; j++) {
    for (let i = 0; i < GW - 1; i++) {
      const a = j * GW + i, b = a + 1, c = a + GW, d = c + 1;
      if ((i + j) & 1) { idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d; }
      else { idx[q++] = a; idx[q++] = d; idx[q++] = b; idx[q++] = a; idx[q++] = c; idx[q++] = d; }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const group = new THREE.Group();
  group.name = 'base-ground';
  const ground = new THREE.Mesh(geo, getCelMaterial());
  group.add(ground);

  // water: depth texture with the sea at SEA_LEVEL and the pond at hf.pondY
  const depth = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const wl = mPond[k]! > POND_M && H[k]! > -1.2 ? hf.pondY : SEA_LEVEL;
    depth[k] = Math.round(clamp((wl - H[k]! + 1) / 4, 0, 1) * 255);
  }
  const depthTex = new THREE.DataTexture(depth, GW, GH, THREE.RedFormat, THREE.UnsignedByteType);
  depthTex.unpackAlignment = 1;
  depthTex.minFilter = depthTex.magFilter = THREE.LinearFilter;
  depthTex.wrapS = depthTex.wrapT = THREE.ClampToEdgeWrapping;
  depthTex.needsUpdate = true;
  const fadeRadius = (radius + 2) * SQ3 + 38;
  const wmat = createWaterMaterial({ depthTexture: depthTex, origin: new THREE.Vector2(x0, z0), step: h, dims: new THREE.Vector2(GW, GH), fadeRadius, fadeCentre: new THREE.Vector2(0, 0) });
  const sea = new THREE.Mesh(new THREE.CircleGeometry(fadeRadius * 1.02, 96), wmat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = SEA_LEVEL;
  sea.renderOrder = 2;
  group.add(sea);
  const pp: number[] = [];
  for (let j = 0; j < GH - 1; j++) {
    for (let i = 0; i < GW - 1; i++) {
      const k = j * GW + i;
      // dilated by one cell so the plane always extends under the bank and the waterline is the true plane/ground intersection
      const k2 = k + GW;
      if (!(Math.max(mPond[k]!, mPond[k + 1]!, mPond[k2]!, mPond[k2 + 1]!) > POND_M)) continue;
      if (Math.min(H[k]!, H[k + 1]!, H[k2]!, H[k2 + 1]!) >= hf.pondY || H[k]! <= -1.2) continue;
      const x = x0 + i * h, z = z0 + j * h, y = hf.pondY, e = h;
      pp.push(x, y, z, x, y, z + e, x + e, y, z, x + e, y, z, x, y, z + e, x + e, y, z + e);
    }
  }
  const pondGeo = new THREE.BufferGeometry();
  pondGeo.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
  const pondMat = createWaterMaterial({
    depthTexture: depthTex, origin: new THREE.Vector2(x0, z0), step: h, dims: new THREE.Vector2(GW, GH), fadeRadius: 1e5, fadeCentre: new THREE.Vector2(0, 0),
    shallow: 0x8fe0c4, deep: 0x2b86a6, depthScale: 2.4, sparkle: true,
  });
  const pond = new THREE.Mesh(pondGeo, pondMat);
  pond.renderOrder = 3;
  pond.frustumCulled = false;
  group.add(pond);

  // pond dressing: reeds on the bank, lily pads on the open water
  const reedsG = makeReeds();
  const padG = makeLilyPad();
  const reedX: InstanceXform[] = [];
  const padX: InstanceXform[] = [];
  for (let j = 1; j < GH - 1; j++) {
    for (let i = 1; i < GW - 1; i++) {
      const k = j * GW + i;
      if (mPond[k]! < POND_M) continue;
      const x = x0 + i * h, z = z0 + j * h, d = hf.pondY - H[k]!;
      const r = hash3i(i, j, 41, seed);
      if (d > -0.22 && d < 0.04 && r < 0.3) reedX.push({ x: x + (hash3i(i, j, 42, seed) - 0.5) * h, y: H[k]! - 0.02, z: z + (hash3i(i, j, 43, seed) - 0.5) * h, rot: r * 40, scale: 0.8 + hash3i(i, j, 44, seed) * 0.7 });
      else if (d > 0.14 && d < 0.5 && r > 0.9) padX.push({ x, y: hf.pondY + 0.012, z, rot: r * 90, scale: 0.45 + hash3i(i, j, 45, seed) * 0.3 });
    }
  }
  group.add(makeInstanced(reedsG, null, reedX, false), makeInstanced(padG, null, padX, false));

  // props
  const pines = [makePine(0), makePine(1)];
  const oaks = [makeOak(0), makeOak(1)];
  const rocks = [makeRockVariant(0), makeRockVariant(2), makeRockVariant(5)];
  const tuft = makeTuft(0.28, hexRGB(PAL.meadow[1]!), hexRGB(0x8cc060));
  const tp: InstanceXform[][] = [[], [], [], []];
  const rp: InstanceXform[][] = [[], [], []];
  const tf: InstanceXform[] = [];
  const hash = (a: number, b: number, c: number): number => hash3i(a, b, c, seed);
  for (let c = 0; c < grid.count; c++) {
    const t = terrain[c]!;
    const cx = grid.x[c]!, cz = grid.z[c]!;
    if (t === BASE_FOREST) {
      const cnt = 3 + Math.floor(hash(c, 1, 1) * 3);
      for (let i = 0; i < cnt; i++) {
        const a = hash(c, i, 2) * Math.PI * 2;
        const r = 0.15 + Math.sqrt(hash(c, i, 3)) * 0.6;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r * 0.9;
        const oak = hash(c, i, 4) < 0.35;
        const v = Math.floor(hash(c, i, 5) * 2);
        tp[(oak ? 2 : 0) + v]!.push({ x, y: hf.heightAt(x, z) - 0.03, z, rot: hash(c, i, 6) * 6.28, scale: 0.62 + hash(c, i, 7) * 0.3 });
      }
    } else if (t === BASE_ROCK) {
      const cnt = 1 + Math.floor(hash(c, 1, 8) * 2);
      for (let i = 0; i < cnt; i++) {
        const a = hash(c, i, 9) * Math.PI * 2;
        const r = Math.sqrt(hash(c, i, 10)) * 0.55;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        rp[i % 3]!.push({ x, y: hf.heightAt(x, z) + 0.05, z, rot: hash(c, i, 11) * 6.28, scale: 0.7 + hash(c, i, 12) * 0.7 });
      }
    } else if (t === BASE_CLIFF) {
      const y = hf.heightAt(cx, cz);
      if (y > -0.6 && hash(c, 1, 13) < 0.35) {
        rp[c % 3]!.push({ x: cx, y: y + 0.05, z: cz, rot: hash(c, 2, 14) * 6.28, scale: 0.9 + hash(c, 3, 15) * 0.8 });
      }
    } else if (t === BASE_GRASS && hash(c, 1, 16) < 0.55) {
      for (let i = 0; i < 2; i++) {
        const x = cx + (hash(c, i, 17) - 0.5) * 1.1, z = cz + (hash(c, i, 18) - 0.5) * 1.0;
        tf.push({ x, y: hf.heightAt(x, z), z, rot: hash(c, i, 19) * 6.28, scale: 0.8 + hash(c, i, 20) * 0.6, tint: 0.92 + 0.16 * hash(c, i, 21) });
      }
    }
  }
  const props = new THREE.Group();
  props.name = 'base-props';
  [pines[0]!, pines[1]!, oaks[0]!, oaks[1]!].forEach((g, i) => props.add(makeInstanced(g, null, tp[i]!, true, 0.05)));
  rocks.forEach((g, i) => props.add(makeInstanced(g, null, rp[i]!, true, 0.05)));
  props.add(makeInstanced(tuft, null, tf, false));
  group.add(props);

  return {
    hf, grid, group, seaY: SEA_LEVEL,
    dispose() {
      geo.dispose(); pondGeo.dispose(); pondMat.dispose(); reedsG.dispose(); padG.dispose(); sea.geometry.dispose(); depthTex.dispose(); wmat.dispose();
      for (const g of [...pines, ...oaks, ...rocks, tuft]) g.dispose();
    },
  };
}
