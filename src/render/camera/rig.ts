import * as THREE from 'three';

export interface CameraBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CameraRigOptions {
  bounds: CameraBounds;
  /** Camera distances for [near (city), mid (region), far (world)]. */
  zoomLevels: [number, number, number];
  pitchDeg?: number;
  fov?: number;
  /** Start target (default bounds centre). */
  start?: { x: number; z: number };
  edgeScroll?: boolean;
}

export type ZoomLevelName = 'city' | 'region' | 'world';

export interface CameraRig {
  update(dt: number): void;
  yawLeft(): void;
  yawRight(): void;
  focus(x: number, z: number, dist?: number): void;
  /** Jump (no easing) to a target; useful on scene switch. */
  snapTo(x: number, z: number, dist?: number): void;
  setZoomLevel(i: 0 | 1 | 2): void;
  zoomLevelName(): ZoomLevelName;
  setBounds(b: CameraBounds): void;
  setEdgeScroll(on: boolean): void;
  getTarget(): { x: number; z: number };
  getDistance(): number;
  /** Yaw in radians (animated) and snapped index 0..3. */
  getYaw(): number;
  getYawIndex(): number;
  readonly camera: THREE.PerspectiveCamera;
  dispose(): void;
}

const TAU = Math.PI * 2;
const isTyping = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
};
const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/**
 * Narrow-FOV isometric-style camera. Pitch fixed, yaw snaps in 90 degree steps with an eased tween,
 * wheel zoom is continuous within [near, far] with a snap hint to the three levels when scrolling stops.
 */
export function createCameraRig(camera: THREE.PerspectiveCamera, dom: HTMLElement, opts: CameraRigOptions): CameraRig {
  const pitch = ((opts.pitchDeg ?? 38) * Math.PI) / 180;
  const fov = opts.fov ?? 30;
  const [near, mid, far] = opts.zoomLevels;
  let bounds = { ...opts.bounds };
  camera.fov = fov;
  camera.near = Math.max(0.5, near * 0.2);
  camera.far = far * 8 + 200;
  camera.updateProjectionMatrix();

  const target = new THREE.Vector2(
    opts.start?.x ?? (bounds.minX + bounds.maxX) / 2,
    opts.start?.z ?? (bounds.minZ + bounds.maxZ) / 2,
  );
  const goal = target.clone();
  let dist = mid;
  let distGoal = mid;
  let yawIndex = 0;
  let yaw = 0;
  let yawTween: { from: number; to: number; t: number } | null = null;
  let edgeScroll = opts.edgeScroll ?? false;
  let lastWheel = -1;
  let timeNow = 0;
  const keys = new Set<string>();
  const mouse = { x: 0, y: 0, inside: false };
  let drag: { x: number; y: number; id: number } | null = null;

  const clampGoal = (v: THREE.Vector2): void => {
    v.x = Math.min(bounds.maxX, Math.max(bounds.minX, v.x));
    v.y = Math.min(bounds.maxZ, Math.max(bounds.minZ, v.y));
  };
  const clampDist = (d: number): number => Math.min(far, Math.max(near, d));

  function rightVec(out: THREE.Vector2): THREE.Vector2 {
    return out.set(Math.cos(yaw), -Math.sin(yaw));
  }
  function forwardVec(out: THREE.Vector2): THREE.Vector2 {
    return out.set(-Math.sin(yaw), -Math.cos(yaw));
  }
  const tmpR = new THREE.Vector2();
  const tmpF = new THREE.Vector2();

  let yawSteps = 0;
  function stepYaw(dir: 1 | -1): void {
    yawSteps += dir;
    yawIndex = ((yawSteps % 4) + 4) % 4;
    yawTween = { from: yaw, to: yawSteps * (Math.PI / 2), t: 0 };
  }

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const k = Math.exp(Math.max(-300, Math.min(300, e.deltaY)) * 0.0013);
    distGoal = clampDist(distGoal * k);
    lastWheel = timeNow;
  };
  const onDown = (e: PointerEvent): void => {
    if (e.button === 2 || e.button === 1) {
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
      try {
        dom.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      e.preventDefault();
    }
  };
  const onMove = (e: PointerEvent): void => {
    const r = dom.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
    mouse.inside = true;
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    const h = dom.clientHeight || 1;
    const worldPerPx = (2 * dist * Math.tan((fov * Math.PI) / 360)) / h;
    rightVec(tmpR);
    forwardVec(tmpF);
    const fwd = (dy * worldPerPx) / Math.sin(pitch);
    const side = dx * worldPerPx;
    goal.x -= tmpR.x * side - tmpF.x * fwd;
    goal.y -= tmpR.y * side - tmpF.y * fwd;
    clampGoal(goal);
    target.copy(goal);
  };
  const onUp = (e: PointerEvent): void => {
    if (drag && e.pointerId === drag.id) {
      try {
        dom.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      drag = null;
    }
  };
  const onLeave = (): void => {
    mouse.inside = false;
  };
  const onContext = (e: Event): void => e.preventDefault();
  const onKeyDown = (e: KeyboardEvent): void => {
    if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'q' && !e.repeat) stepYaw(-1);
    else if (k === 'e' && !e.repeat) stepYaw(1);
    else if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      keys.add(k);
      if (k.startsWith('arrow')) e.preventDefault();
    }
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    keys.delete(e.key.toLowerCase());
  };
  const onBlur = (): void => keys.clear();

  dom.addEventListener('wheel', onWheel, { passive: false });
  dom.addEventListener('pointerdown', onDown);
  dom.addEventListener('pointermove', onMove);
  dom.addEventListener('pointerup', onUp);
  dom.addEventListener('pointercancel', onUp);
  dom.addEventListener('pointerleave', onLeave);
  dom.addEventListener('contextmenu', onContext);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  const nearestLevel = (): number => {
    const d = [near, mid, far];
    let best = 0;
    for (let i = 1; i < 3; i++) if (Math.abs(Math.log(dist / (d[i] ?? 1))) < Math.abs(Math.log(dist / (d[best] ?? 1)))) best = i;
    return best;
  };

  function apply(): void {
    const cp = Math.cos(pitch);
    camera.position.set(target.x + Math.sin(yaw) * cp * dist, Math.sin(pitch) * dist, target.y + Math.cos(yaw) * cp * dist);
    camera.lookAt(target.x, 0, target.y);
  }

  const rig: CameraRig = {
    camera,
    update(dt) {
      timeNow += dt;
      // keyboard pan
      let mx = 0;
      let mz = 0;
      if (keys.has('w') || keys.has('arrowup')) mz += 1;
      if (keys.has('s') || keys.has('arrowdown')) mz -= 1;
      if (keys.has('d') || keys.has('arrowright')) mx += 1;
      if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
      if (edgeScroll && mouse.inside && !drag) {
        const w = dom.clientWidth;
        const h = dom.clientHeight;
        const m = 14;
        if (mouse.x < m) mx -= 1;
        else if (mouse.x > w - m) mx += 1;
        if (mouse.y < m) mz += 1;
        else if (mouse.y > h - m) mz -= 1;
      }
      if (mx || mz) {
        const len = Math.hypot(mx, mz);
        const speed = dist * 0.9;
        rightVec(tmpR);
        forwardVec(tmpF);
        goal.x += ((tmpR.x * mx + tmpF.x * mz) / len) * speed * dt;
        goal.y += ((tmpR.y * mx + tmpF.y * mz) / len) * speed * dt;
        clampGoal(goal);
      }
      // zoom snap hint after scrolling stops
      if (lastWheel >= 0 && timeNow - lastWheel > 0.18) {
        const d = [near, mid, far];
        const i = nearestLevel();
        if (Math.abs(Math.log(distGoal / (d[i] ?? 1))) < 0.1) distGoal = d[i] ?? distGoal;
        lastWheel = -1;
      }
      const k = 1 - Math.exp(-dt * 10);
      dist += (distGoal - dist) * k;
      if (!drag) {
        target.x += (goal.x - target.x) * k;
        target.y += (goal.y - target.y) * k;
      }
      if (yawTween) {
        yawTween.t = Math.min(1, yawTween.t + dt / 0.28);
        yaw = yawTween.from + (yawTween.to - yawTween.from) * easeInOut(yawTween.t);
        if (yawTween.t >= 1) {
          yaw = yawTween.to;
          yawTween = null;
        }
      }
      apply();
    },
    yawLeft() {
      stepYaw(-1);
    },
    yawRight() {
      stepYaw(1);
    },
    focus(x, z, d) {
      goal.set(x, z);
      clampGoal(goal);
      if (d !== undefined) distGoal = clampDist(d);
    },
    snapTo(x, z, d) {
      goal.set(x, z);
      clampGoal(goal);
      target.copy(goal);
      if (d !== undefined) {
        distGoal = clampDist(d);
        dist = distGoal;
      }
      apply();
    },
    setZoomLevel(i) {
      distGoal = [near, mid, far][i] ?? mid;
    },
    zoomLevelName() {
      const i = nearestLevel();
      return i === 0 ? 'city' : i === 1 ? 'region' : 'world';
    },
    setBounds(b) {
      bounds = { ...b };
      clampGoal(goal);
    },
    setEdgeScroll(on) {
      edgeScroll = on;
    },
    getTarget: () => ({ x: target.x, z: target.y }),
    getDistance: () => dist,
    getYaw: () => ((yaw % TAU) + TAU) % TAU,
    getYawIndex: () => yawIndex,
    dispose() {
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointercancel', onUp);
      dom.removeEventListener('pointerleave', onLeave);
      dom.removeEventListener('contextmenu', onContext);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    },
  };
  apply();
  return rig;
}
