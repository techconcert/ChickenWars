// Season look director: smooth transitions of the shared sun / sky / snow / leaf uniforms (art direction: seasons).
import * as THREE from 'three';
import { sharedUniforms, setSeasonLook } from '../materials';
import { lerp } from './util';

interface Look { snow: number; leaf: number; sun: [number, number, number]; sunCol: [number, number, number]; sky: [number, number, number]; ground: [number, number, number]; fog: [number, number, number] }

const hex = (h: number): [number, number, number] => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

/** spring soft green-white, summer warm bright, autumn amber low, winter cold blue-white. */
const LOOKS: Look[] = [
  { snow: 0, leaf: 0, sun: [0.42, 0.8, 0.42], sunCol: hex(0xfffaf0), sky: [1.0, 1.05, 1.03], ground: [0.84, 0.83, 0.78], fog: hex(0xc4e8e0) },
  { snow: 0, leaf: 0, sun: [0.45, 0.78, 0.43], sunCol: hex(0xfff0cf), sky: [1.05, 1.03, 1.0], ground: [0.86, 0.81, 0.74], fog: hex(0xbfe0e4) },
  { snow: 0, leaf: 0.9, sun: [0.62, 0.66, 0.45], sunCol: hex(0xffd49a), sky: [1.04, 0.98, 0.92], ground: [0.86, 0.78, 0.68], fog: hex(0xe3d3b0) },
  { snow: 0.92, leaf: 0, sun: [0.45, 0.68, 0.45], sunCol: hex(0xd6e4ff), sky: [0.95, 1.0, 1.1], ground: [0.78, 0.8, 0.86], fog: hex(0xd0dfee) },
];

const cur: Look = JSON.parse(JSON.stringify(LOOKS[1])) as Look;
let seeded = false;
const _sun = new THREE.Vector3();
const _sky = new THREE.Vector3();
const _gr = new THREE.Vector3();

/** Call once per frame with the season index. Returns the fog / clear colour as 0xRRGGBB. */
export function updateSeasonLook(dt: number, season: number, instant = false, dayFrac = 0.5): number {
  const tgt = LOOKS[season] ?? LOOKS[1]!;
  const k = instant || !seeded ? 1 : 1 - Math.exp(-dt * 1.0); // ~95% settled in 3 s
  seeded = true;
  cur.snow = lerp(cur.snow, tgt.snow, k);
  cur.leaf = lerp(cur.leaf, tgt.leaf, k);
  for (let i = 0; i < 3; i++) {
    cur.sun[i] = lerp(cur.sun[i]!, tgt.sun[i]!, k);
    cur.sunCol[i] = lerp(cur.sunCol[i]!, tgt.sunCol[i]!, k);
    cur.sky[i] = lerp(cur.sky[i]!, tgt.sky[i]!, k);
    cur.ground[i] = lerp(cur.ground[i]!, tgt.ground[i]!, k);
    cur.fog[i] = lerp(cur.fog[i]!, tgt.fog[i]!, k);
  }
  const to8 = (v: number): number => Math.max(0, Math.min(255, Math.round(v * 255)));
  const fogHex = (to8(cur.fog[0]!) << 16) | (to8(cur.fog[1]!) << 8) | to8(cur.fog[2]!);
  // slow, subtle day cycle on top of the season look (periodic, so no jump at day rollover)
  // dayFrac 0 = dawn, 0.25 = noon, 0.5 = dusk, 0.75 = midnight
  const ph = dayFrac * Math.PI * 2;
  const c = Math.sin(ph);
  const night = Math.max(0, -c) * 0.4;
  const warm = (1 - Math.abs(c)) * 0.25;
  const bright = 0.92 + 0.08 * c;
  const az = Math.cos(ph) * 0.45;
  const sx = cur.sun[0]! * Math.cos(az) - cur.sun[2]! * Math.sin(az);
  const sz = cur.sun[0]! * Math.sin(az) + cur.sun[2]! * Math.cos(az);
  const sy = cur.sun[1]! * (0.95 + 0.05 * c); // keep flat ground inside the top cel band (no pop at band edges)
  const tint: [number, number, number] = [1 + warm * 0.18 - night * 0.25, 1 - warm * 0.05 - night * 0.1, 1 - warm * 0.28 + night * 0.12];
  const sunC = cur.sunCol.map((v, i) => v * bright * tint[i]!) as [number, number, number];
  const skyK = 0.93 + 0.07 * c;
  const sunHex = (to8(sunC[0]) << 16) | (to8(sunC[1]) << 8) | to8(sunC[2]);
  setSeasonLook({
    snowBlend: cur.snow,
    leafShift: cur.leaf,
    sunDir: _sun.set(sx, sy, sz),
    sunColour: sunHex,
    sky: _sky.set(cur.sky[0]! * skyK * (1 - night * 0.2), cur.sky[1]! * skyK * (1 - night * 0.1), cur.sky[2]! * skyK * (1 + night * 0.05)),
    ground: _gr.set(cur.ground[0]! * skyK, cur.ground[1]! * skyK, cur.ground[2]! * skyK),
    fogColour: fogHex,
  });
  return fogHex;
}

export const currentSnow = (): number => sharedUniforms.uSnow.value;
