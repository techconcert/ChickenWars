// Weather particles: one THREE.Points cloud around the camera focus (spring rain, autumn leaves, winter snow).
// Disabled on low quality and with reduced motion. Cross-fades by intensity when the season changes.
import * as THREE from 'three';
import { circleTexture, clamp } from '../view/util';

export type WeatherKind = 'none' | 'rain' | 'leaves' | 'snow';
export const SEASON_WEATHER: WeatherKind[] = ['rain', 'none', 'leaves', 'snow'];

interface Params { size: number; fall: number; sway: number; wind: number; cols: number[]; max: number; opacity: number }
const PARAMS: Record<Exclude<WeatherKind, 'none'>, Params> = {
  rain: { size: 0.11, fall: 15, sway: 0, wind: 2.2, cols: [0xbcd8f0, 0xd8ecfa], max: 1, opacity: 0.7 },
  leaves: { size: 0.3, fall: 1.5, sway: 1.3, wind: 0.9, cols: [0xd9822b, 0xc2552f, 0xe3b341, 0x9a5a38], max: 0.55, opacity: 0.95 },
  snow: { size: 0.24, fall: 1.9, sway: 0.7, wind: 0.3, cols: [0xffffff, 0xeaf3ff], max: 0.9, opacity: 0.95 },
};
const N = 1100;
const HEIGHT = 14;

const _d = new THREE.Vector3();

export class Weather {
  readonly points: THREE.Points;
  private pos = new Float32Array(N * 3);
  private col = new Float32Array(N * 3);
  private seed = new Float32Array(N);
  private kind: WeatherKind = 'none';
  private target: WeatherKind = 'none';
  private level = 0;
  private enabled = true;
  private mat: THREE.PointsMaterial;
  private cx = 0;
  private cz = 0;
  private floor = 0;
  private half = 14;
  private init = false;

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    for (let i = 0; i < N; i++) this.seed[i] = Math.random(); // render-only randomness (not sim state)
    this.mat = new THREE.PointsMaterial({ size: 0.2, map: circleTexture('hard'), vertexColors: true, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true, fog: false, toneMapped: false });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    this.points.visible = false;
    this.points.name = 'weather';
  }

  setEnabled(on: boolean): void { this.enabled = on; }
  get active(): WeatherKind { return this.kind; }

  private recolour(k: Exclude<WeatherKind, 'none'>): void {
    const p = PARAMS[k];
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      c.setHex(p.cols[i % p.cols.length]!);
      this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    }
    (this.points.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    this.mat.size = p.size;
  }

  private scatter(): void {
    for (let i = 0; i < N; i++) {
      const s = this.seed[i]!;
      this.pos[i * 3] = this.cx + (frac(s * 91.7) * 2 - 1) * this.half;
      this.pos[i * 3 + 1] = this.floor + frac(s * 37.3) * HEIGHT;
      this.pos[i * 3 + 2] = this.cz + (frac(s * 53.9) * 2 - 1) * this.half;
    }
  }

  /** Advance; `camera` + `groundY` locate the focus point, `season` picks the weather. */
  update(dt: number, season: number, camera: THREE.Camera, groundY: number, camDist: number, time: number): void {
    this.target = this.enabled ? (SEASON_WEATHER[season] ?? 'none') : 'none';
    // fade out the current kind first, then switch
    if (this.target !== this.kind) {
      this.level = Math.max(0, this.level - dt / 1.4);
      if (this.level <= 0) {
        this.kind = this.target;
        if (this.kind !== 'none') { this.recolour(this.kind); this.init = false; }
      }
    } else if (this.kind !== 'none') this.level = Math.min(1, this.level + dt / 1.6);
    const on = this.kind !== 'none' && this.level > 0.001;
    this.points.visible = on;
    if (!on) return;
    const p = PARAMS[this.kind as Exclude<WeatherKind, 'none'>];
    this.mat.opacity = p.opacity * this.level;
    // focus: where the camera looks at the ground plane
    camera.getWorldDirection(_d);
    const t = _d.y < -0.05 ? (camera.position.y - groundY) / -_d.y : camDist;
    const fx = camera.position.x + _d.x * t, fz = camera.position.z + _d.z * t;
    this.half = clamp(camDist * 0.62, 9, 46);
    this.floor = groundY - 0.4;
    const fresh = !this.init;
    if (fresh) { this.cx = fx; this.cz = fz; this.init = true; this.scatter(); }
    this.cx += (fx - this.cx) * Math.min(1, dt * 6);
    this.cz += (fz - this.cz) * Math.min(1, dt * 6);
    const dens = Math.round(N * p.max * clamp(0.45 + camDist / 70, 0.5, 1));
    this.points.geometry.setDrawRange(0, dens);
    const h = this.half;
    for (let i = 0; i < dens; i++) {
      const s = this.seed[i]!;
      let x = this.pos[i * 3]!, y = this.pos[i * 3 + 1]!, z = this.pos[i * 3 + 2]!;
      const sw = p.sway * Math.sin(time * (0.8 + s) + s * 40);
      x += (p.wind + sw) * dt;
      z += p.sway * 0.6 * Math.cos(time * (0.7 + s) + s * 30) * dt;
      y -= p.fall * (0.75 + s * 0.5) * dt;
      if (y < this.floor) { y += HEIGHT; x = this.cx + (frac(s * 17.1 + time * 0.37) * 2 - 1) * h; z = this.cz + (frac(s * 29.3 + time * 0.21) * 2 - 1) * h; }
      // keep inside the moving box
      if (x > this.cx + h) x -= 2 * h; else if (x < this.cx - h) x += 2 * h;
      if (z > this.cz + h) z -= 2 * h; else if (z < this.cz - h) z += 2 * h;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}

const frac = (v: number): number => v - Math.floor(v);
