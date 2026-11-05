// Picking helpers: ground ray-march against a height function, screen-space nearest pick for small markers, and a
// pointer input wrapper that separates clicks from drags (camera pans with right / middle drag).
import * as THREE from 'three';

export type HeightFn = (x: number, z: number) => number;

const _ray = new THREE.Ray();
const _ndc = new THREE.Vector3();

/** Ray from the camera through a pointer position given in CSS pixels relative to the canvas. */
export function pointerRay(camera: THREE.PerspectiveCamera, px: number, py: number, w: number, h: number): THREE.Ray {
  _ndc.set((px / w) * 2 - 1, -(py / h) * 2 + 1, 0.5).unproject(camera);
  return _ray.set(camera.position, _ndc.sub(camera.position).normalize());
}

/** First intersection of `ray` with the surface y = heightAt(x,z); null when it misses (limits: y range and max distance). */
export function groundHit(ray: THREE.Ray, heightAt: HeightFn, maxY: number, minY: number, maxDist = 600, out = new THREE.Vector3()): THREE.Vector3 | null {
  const o = ray.origin;
  const d = ray.direction;
  if (d.y >= -1e-4) return null;
  let t = Math.max(0, (maxY - o.y) / d.y);
  const step = 0.35;
  let prevT = t;
  for (; t < maxDist; t += step) {
    const x = o.x + d.x * t;
    const z = o.z + d.z * t;
    const y = o.y + d.y * t;
    if (y < minY) return null;
    if (y <= heightAt(x, z)) {
      let lo = prevT;
      let hi = t;
      for (let i = 0; i < 12; i++) {
        const m = (lo + hi) / 2;
        if (o.y + d.y * m <= heightAt(o.x + d.x * m, o.z + d.z * m)) hi = m;
        else lo = m;
      }
      const tt = (lo + hi) / 2;
      return out.set(o.x + d.x * tt, o.y + d.y * tt, o.z + d.z * tt);
    }
    prevT = t;
  }
  return null;
}

export interface Pickable {
  kind: string;
  id: string;
  pos: THREE.Vector3;
  /** screen-space pick radius in CSS pixels */
  radiusPx: number;
  /** higher wins ties */
  priority: number;
}

const _p = new THREE.Vector3();
/** Nearest pickable whose projected position lies within its radius of the pointer. */
export function pickScreen(items: Pickable[], camera: THREE.PerspectiveCamera, w: number, h: number, px: number, py: number): Pickable | null {
  let best: Pickable | null = null;
  let bestScore = Infinity;
  for (const it of items) {
    _p.copy(it.pos).project(camera);
    if (_p.z > 1 || _p.z < -1) continue;
    const sx = (_p.x * 0.5 + 0.5) * w;
    const sy = (-_p.y * 0.5 + 0.5) * h;
    const d = Math.hypot(sx - px, sy - py);
    if (d > it.radiusPx) continue;
    const score = d - it.priority * 8;
    if (score < bestScore) {
      bestScore = score;
      best = it;
    }
  }
  return best;
}

export interface PointerHandlers {
  move(px: number, py: number, e: PointerEvent): void;
  click(px: number, py: number, e: PointerEvent): void;
  rightClick(px: number, py: number, e: PointerEvent): void;
  leave(): void;
}

/** Hover / click wrapper. A press that moves more than 5 px is a drag (camera) and produces no click. */
export function attachPointer(canvas: HTMLElement, h: PointerHandlers): () => void {
  let down: { x: number; y: number; b: number } | null = null;
  const rel = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const onDown = (e: PointerEvent): void => { const [x, y] = rel(e); down = { x, y, b: e.button }; };
  const onMove = (e: PointerEvent): void => { const [x, y] = rel(e); h.move(x, y, e); };
  const onUp = (e: PointerEvent): void => {
    const [x, y] = rel(e);
    if (down && down.b === e.button && Math.hypot(x - down.x, y - down.y) < 5) {
      if (e.button === 0) h.click(x, y, e);
      else if (e.button === 2) h.rightClick(x, y, e);
    }
    down = null;
  };
  const onLeave = (): void => h.leave();
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointerleave', onLeave);
  };
}
