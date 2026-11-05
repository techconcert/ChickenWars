// Translucent placement ghost: green when the cell is valid, red when not.
import * as THREE from 'three';
import { BUILDINGS } from '../../../sim/data/registry';
import { buildBuildingMesh } from '../../meshes';

export class PlacementGhost {
  readonly group = new THREE.Group();
  private type: string | null = null;
  private mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false, fog: false });
  private model: THREE.Group | null = null;

  constructor() {
    this.group.visible = false;
    this.group.name = 'ghost';
  }

  show(type: string, pos: THREE.Vector3, valid: boolean): void {
    if (this.type !== type) {
      if (this.model) this.group.remove(this.model);
      const m = buildBuildingMesh(BUILDINGS[type]?.mesh ?? 'house', 1);
      m.traverse((o) => {
        const me = o as THREE.Mesh;
        if (!me.isMesh) return;
        if (o.userData['isOutline']) o.visible = false;
        else me.material = this.mat;
      });
      this.model = m;
      this.group.add(m);
      this.type = type;
    }
    this.mat.color.setHex(valid ? 0xb6ffb0 : 0xff9a8a);
    this.group.position.copy(pos);
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }

  dispose(): void {
    this.mat.dispose();
  }
}
