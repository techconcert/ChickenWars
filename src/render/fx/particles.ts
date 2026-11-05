// Pooled instanced particles (dust puffs, build sparkles, hit sparks): one InstancedMesh, one draw call.
import * as THREE from 'three';

interface P { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; s0: number; s1: number; grav: number; col: THREE.Color }

export class ParticlePool {
  readonly mesh: THREE.InstancedMesh;
  private ps: P[] = [];
  private free: number[] = [];
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private count = 0;

  constructor(readonly max: number, geo: THREE.BufferGeometry, opacity = 0.9) {
    const mat = new THREE.MeshBasicMaterial({ transparent: opacity < 1, opacity, depthWrite: false, fog: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 7;
    for (let i = 0; i < max; i++) this.free.push(max - 1 - i);
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, colour: number, grav = 0): void {
    const id = this.free.pop();
    if (id === undefined) return;
    const col = new THREE.Color(colour);
    this.ps[id] = { x, y, z, vx, vy, vz, age: 0, life, s0, s1, grav, col };
    this.count++;
  }

  get active(): number {
    return this.count;
  }

  update(dt: number): void {
    let hi = 0;
    for (let i = 0; i < this.ps.length; i++) {
      const p = this.ps[i];
      if (!p) continue;
      p.age += dt;
      if (p.age >= p.life) {
        delete this.ps[i];
        this.free.push(i);
        this.count--;
        this.s.set(0, 0, 0);
        this.m4.compose(this.p.set(0, -999, 0), this.q.identity(), this.s);
        this.mesh.setMatrixAt(i, this.m4);
        continue;
      }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const t = p.age / p.life;
      const sc = t < 0.25 ? (p.s0 + (p.s1 - p.s0) * (t / 0.25)) : p.s1 * (1 - (t - 0.25) / 0.75);
      this.m4.compose(this.p.set(p.x, p.y, p.z), this.q.identity(), this.s.set(sc, sc, sc));
      this.mesh.setMatrixAt(i, this.m4);
      this.mesh.setColorAt(i, p.col);
      hi = i + 1;
    }
    this.mesh.count = hi;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

export const dustGeo = (): THREE.BufferGeometry => new THREE.IcosahedronGeometry(0.5, 0);
export const sparkGeo = (): THREE.BufferGeometry => new THREE.OctahedronGeometry(0.5, 0);
