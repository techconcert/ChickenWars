import * as THREE from 'three';
import { GeoBuilder, PAL, clamp } from '../builder';
import { addOutline, getCelMaterial } from '../../materials';
import { egg, roundBale, taperBox } from './parts';

let scaffoldGeo: THREE.BufferGeometry | null = null;
let partialGeo: THREE.BufferGeometry | null = null;

function scaffold(): THREE.BufferGeometry {
  if (scaffoldGeo) return scaffoldGeo;
  const b = new GeoBuilder(9);
  const R = 0.55, H = 1.05;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(sx * R, 0, sz * R, 0.035, 0.04, H, PAL.timber, 6, { jitter: 0.03 });
  for (const y of [0.3, 0.62, 0.94]) {
    for (const sz of [-1, 1]) b.box(0, y, sz * R, 2 * R, 0.05, 0.05, PAL.timberLight);
    for (const sx of [-1, 1]) b.box(sx * R, y, 0, 0.05, 0.05, 2 * R, PAL.timberLight);
  }
  // diagonal braces
  b.box(0, 0.3, R, 0.04, 0.78, 0.04, PAL.timberLight, { rotZ: 0.95, jitter: 0 });
  b.box(R, 0.3, 0, 0.04, 0.78, 0.04, PAL.timberLight, { rotX: 0.95, jitter: 0 });
  // plank platform + ladder, a round bale and a fresh egg on the planks
  b.box(0, 0.3, 0, 2 * R, 0.03, 2 * R - 0.1, PAL.timberLight);
  b.box(0.7, 0, 0.55, 0.14, 0.7, 0.03, PAL.timber, { rotZ: -0.3 });
  roundBale(b, -0.3, 0.33, 0.38, 0.08, 0.14, 0.3, true);
  egg(b, 0.32, 0.33, 0.4, 0.045);
  return (scaffoldGeo = b.build());
}

function partial(): THREE.BufferGeometry {
  if (partialGeo) return partialGeo;
  const b = new GeoBuilder(10);
  // rising footing: stone base, cream wall course with a door gap, timber top plate (scaled up as work progresses)
  taperBox(b, 0, 0, 0, 0.72, 0.18, 0.72, PAL.stoneLight, 0.95);
  taperBox(b, 0, 0.18, 0, 0.62, 0.18, 0.62, PAL.cream, 0.97);
  b.box(0, 0.18, 0.305, 0.16, 0.15, 0.02, PAL.timberDark, { jitter: 0 });
  taperBox(b, 0, 0.36, 0, 0.66, 0.035, 0.66, PAL.timber, 1, { jitter: 0 });
  return (partialGeo = b.build());
}

function ringGeometry(progress: number): THREE.BufferGeometry {
  const p = clamp(progress, 0, 1);
  const g = new THREE.RingGeometry(0.8, 0.94, 40, 1, Math.PI / 2, -Math.PI * 2 * Math.max(0.001, p));
  g.rotateX(-Math.PI / 2);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([0.89, 0.7, 0.25], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aEmit', new THREE.BufferAttribute(new Float32Array(n).fill(0.8), 1));
  return g;
}

/**
 * Wood scaffolding around a rising stone footing plus a ground progress ring (gold arc over a grey track).
 * Update with `group.userData.setProgress(p)` (0..1).
 */
export function buildScaffoldMesh(progress: number, opts: { fogOfWar?: boolean } = {}): THREE.Group {
  const mat = getCelMaterial({ fogOfWar: opts.fogOfWar });
  const g = new THREE.Group();
  g.name = 'scaffold';
  g.userData['shared'] = true;
  const sc = new THREE.Mesh(scaffold(), mat);
  addOutline(sc, 0.045, null, opts.fogOfWar);
  g.add(sc);
  const part = new THREE.Mesh(partial(), mat);
  addOutline(part, 0.045, null, opts.fogOfWar);
  g.add(part);
  const track = new THREE.Mesh(
    (() => {
      const t = new THREE.RingGeometry(0.8, 0.94, 40);
      t.rotateX(-Math.PI / 2);
      const n = t.getAttribute('position').count;
      t.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.35), 3));
      return t;
    })(),
    mat,
  );
  track.position.y = 0.025;
  g.add(track);
  const arc = new THREE.Mesh(ringGeometry(progress), mat);
  arc.position.y = 0.04;
  g.add(arc);
  const apply = (p: number): void => {
    const q = clamp(p, 0, 1);
    part.scale.set(1, 0.4 + 1.6 * q, 1);
    arc.geometry.dispose();
    arc.geometry = ringGeometry(q);
    arc.visible = q > 0.001;
  };
  g.userData['setProgress'] = apply;
  apply(progress);
  return g;
}
