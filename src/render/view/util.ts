// Small shared helpers for render code (no game logic).
import * as THREE from 'three';

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export type Quality = 'low' | 'medium' | 'high';

/** Dispatch a CustomEvent on window (guarded so tests / SSR do not throw). */
export function emitWindow(name: string, detail: unknown): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/** Free geometries and materials under `obj` that are not flagged `userData.shared`. */
export function disposeTree(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh && !(o as THREE.Points).isPoints && !(o as THREE.Line).isLine) return;
    if (o.userData['sharedGeo'] || o.parent?.userData['shared'] || obj.userData['shared']) return;
    m.geometry?.dispose();
  });
}

/** `reducedMotion` flag from localStorage 'hl-settings' (JSON {reducedMotion?:boolean}). Re-read at most once a second. */
let rmCache = false;
let rmAt = -1e9;
export function reducedMotion(): boolean {
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  if (now - rmAt < 1000) return rmCache;
  rmAt = now;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('hl-settings') : null;
    rmCache = raw ? (JSON.parse(raw) as { reducedMotion?: boolean }).reducedMotion === true : false;
  } catch {
    rmCache = false;
  }
  return rmCache;
}

/** Boolean flag from localStorage 'hl-settings' (JSON), default when missing; re-read at most once a second per key. */
const flagCache = new Map<string, { v: boolean; at: number }>();
export function settingFlag(key: string, dflt: boolean): boolean {
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  const hit = flagCache.get(key);
  if (hit && now - hit.at < 1000) return hit.v;
  let v = dflt;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('hl-settings') : null;
    const o = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    if (o && typeof o[key] === 'boolean') v = o[key] as boolean;
  } catch {
    v = dflt;
  }
  flagCache.set(key, { v, at: now });
  return v;
}

/** Cached radial / circle textures for sprites and points. */
const texCache = new Map<string, THREE.CanvasTexture>();
export function circleTexture(kind: 'soft' | 'hard' | 'star'): THREE.CanvasTexture {
  let t = texCache.get(kind);
  if (t) return t;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d')!;
  if (kind === 'star') {
    c.translate(32, 32);
    c.fillStyle = '#fff';
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const r = i % 2 === 0 ? 30 : 10;
      const a = (i / 16) * Math.PI * 2;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
  } else {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 30);
    g.addColorStop(0, '#fff');
    g.addColorStop(kind === 'hard' ? 0.85 : 0.35, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  }
  t = new THREE.CanvasTexture(cv);
  texCache.set(kind, t);
  return t;
}

/** Text sprite (canvas texture). Caller owns disposal via `disposeSprite`. */
export function makeTextSprite(text: string, colour = '#fff7dc', size = 44, bg: string | null = null): THREE.Sprite {
  const cv = document.createElement('canvas');
  const c = cv.getContext('2d')!;
  c.font = `bold ${size}px sans-serif`;
  const w = Math.ceil(c.measureText(text).width) + 28;
  cv.width = w;
  cv.height = size + 24;
  c.font = `bold ${size}px sans-serif`;
  c.textBaseline = 'middle';
  if (bg) {
    c.fillStyle = bg;
    c.beginPath();
    c.roundRect(2, 2, cv.width - 4, cv.height - 4, 14);
    c.fill();
  }
  c.lineWidth = 6;
  c.strokeStyle = '#3a2f26';
  c.lineJoin = 'round';
  c.strokeText(text, 14, cv.height / 2 + 2);
  c.fillStyle = colour;
  c.fillText(text, 14, cv.height / 2 + 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false }));
  sp.scale.set((cv.width / cv.height) * 0.5, 0.5, 1);
  sp.renderOrder = 20;
  return sp;
}

export function disposeSprite(sp: THREE.Sprite): void {
  sp.material.map?.dispose();
  sp.material.dispose();
  sp.parent?.remove(sp);
}

/** Unit direction (dx,dz) -> yaw so a +Z-facing model looks along it. */
export const yawOf = (dx: number, dz: number): number => Math.atan2(dx, dz);

export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Hex corner offsets for neighbour direction k (pointy-top, circumradius 1): corners at angles 60k-30 and 60k+30. */
export function edgeCorners(k: number): [number, number, number, number] {
  const a0 = ((60 * k - 30) * Math.PI) / 180;
  const a1 = ((60 * k + 30) * Math.PI) / 180;
  return [Math.cos(a0), Math.sin(a0), Math.cos(a1), Math.sin(a1)];
}
