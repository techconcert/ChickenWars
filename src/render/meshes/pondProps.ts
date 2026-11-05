// Cheap pond shore dressing: a cattail/reed clump and a lily pad. Origin at the base; instanced by the base terrain.
import type * as THREE from 'three';
import { GeoBuilder } from './builder';

const REED = [0x6f9a3e, 0x84ad4a, 0x5e8a38];
const CATTAIL = 0x6b4a2f;
const PAD = [0x4f9a48, 0x62ab52];
const BLOOM = 0xfff1c9;

/** Six blades and two brown cattail heads leaning outwards. */
export function makeReeds(): THREE.BufferGeometry {
  const b = new GeoBuilder(33);
  b.ao = false;
  const blades: [number, number, number, number][] = [[0, 0, 0.55, 0.05], [0.07, 0.03, 0.42, -0.2], [-0.06, 0.04, 0.48, 0.25], [0.03, -0.07, 0.36, 0.1], [-0.05, -0.05, 0.4, -0.3], [0.1, -0.03, 0.3, -0.12]];
  blades.forEach(([x, z, h, lean], i) => b.cone(x, 0, z, 0.018, h, REED[i % 3]!, 3, { rotZ: lean, rotX: lean * 0.6, jitter: 0 }));
  b.cyl(0, 0.34, 0, 0.026, 0.026, 0.1, CATTAIL, 5, { jitter: 0 });
  b.cyl(0.07, 0.3, 0.03, 0.022, 0.022, 0.08, CATTAIL, 5, { rotZ: -0.2, jitter: 0 });
  return b.build();
}

/** Flat floating lily pad with a tiny cream bloom. */
export function makeLilyPad(): THREE.BufferGeometry {
  const b = new GeoBuilder(34);
  b.ao = false;
  b.cyl(0, 0, 0, 0.17, 0.17, 0.015, PAD[0]!, 9, { jitter: 0 });
  b.cyl(0.03, 0.012, 0.02, 0.1, 0.1, 0.006, PAD[1]!, 7, { jitter: 0 });
  b.sphere(0.04, 0.03, 0.03, 0.03, BLOOM, { scale: [1, 0.7, 1], jitter: 0 }, 0);
  return b.build();
}
