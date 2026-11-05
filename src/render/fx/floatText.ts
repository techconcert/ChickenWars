// Floating text sprites (resource gains on MarchReturned etc.). Rise and fade; cleaned up automatically.
import * as THREE from 'three';
import { getIconCanvas } from '../../gen/icons';
import { disposeSprite, makeTextSprite, reducedMotion } from '../view/util';

interface F { sp: THREE.Sprite; age: number; life: number; y0: number; rise: number; pop: number; sx: number; sy: number }

/** Sprite with a resource icon on the left and bold text on the right. */
function makeGainSprite(text: string, colour: string, iconId: string): THREE.Sprite {
  const size = 40, pad = 12, ico = 44;
  const cv = document.createElement('canvas');
  const c = cv.getContext('2d')!;
  c.font = `bold ${size}px sans-serif`;
  const tw = Math.ceil(c.measureText(text).width);
  cv.width = pad * 2 + ico + 6 + tw;
  cv.height = ico + pad;
  c.font = `bold ${size}px sans-serif`;
  c.textBaseline = 'middle';
  const icon = getIconCanvas(iconId, 64);
  if (icon) c.drawImage(icon, pad, (cv.height - ico) / 2, ico, ico);
  c.lineWidth = 6;
  c.strokeStyle = '#2b2119';
  c.lineJoin = 'round';
  c.strokeText(text, pad + ico + 6, cv.height / 2 + 2);
  c.fillStyle = colour;
  c.fillText(text, pad + ico + 6, cv.height / 2 + 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false }));
  sp.scale.set((cv.width / cv.height) * 0.5, 0.5, 1);
  sp.renderOrder = 20;
  return sp;
}

export class FloatTexts {
  readonly group = new THREE.Group();
  private items: F[] = [];

  add(text: string, colour: string, x: number, y: number, z: number, life = 2.6): void {
    const sp = makeTextSprite(text, colour, 40);
    sp.position.set(x, y, z);
    this.group.add(sp);
    this.items.push({ sp, age: 0, life, y0: y, rise: 1.6, pop: 0, sx: sp.scale.x, sy: sp.scale.y });
  }

  /** Resource gain label: icon plus "+N", pops in, drifts up and fades. Drift is shorter with reduced motion. */
  addGain(amount: number, res: string, colour: string, x: number, y: number, z: number, life = 2.4): void {
    const sp = makeGainSprite(`+${amount}`, colour, res);
    sp.position.set(x, y, z);
    this.group.add(sp);
    this.items.push({ sp, age: 0, life, y0: y, rise: reducedMotion() ? 0.2 : 0.9, pop: 1, sx: sp.scale.x, sy: sp.scale.y });
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const f = this.items[i]!;
      f.age += dt;
      const t = f.age / f.life;
      if (t >= 1) {
        disposeSprite(f.sp);
        this.items.splice(i, 1);
        continue;
      }
      f.sp.position.y = f.y0 + (1 - (1 - t) * (1 - t)) * f.rise;
      f.sp.material.opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      if (f.pop) {
        const k = f.age < 0.18 ? 0.6 + (f.age / 0.18) * 0.55 : f.age < 0.32 ? 1.15 - ((f.age - 0.18) / 0.14) * 0.15 : 1;
        f.sp.scale.set(f.sx * k, f.sy * k, 1);
      }
    }
  }

  clear(): void {
    for (const f of this.items) { this.group.remove(f.sp); disposeSprite(f.sp); }
    this.items = [];
  }

  dispose(): void {
    for (const f of this.items) disposeSprite(f.sp);
    this.items = [];
  }
}
