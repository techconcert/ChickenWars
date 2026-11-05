import type * as THREE from 'three';
import type { ClientView, SceneId } from '../../app/clientView';
import type { Quality } from '../view/util';

export interface SceneCtx {
  canvas: HTMLCanvasElement;
  client: ClientView;
  quality: Quality;
}

export interface CamState { x: number; z: number; dist: number }

export interface SceneModule {
  readonly id: SceneId;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  activate(): void;
  deactivate(): void;
  /** dt in seconds, time in seconds since start. */
  update(dt: number, time: number): void;
  focusCell(cell: number): void;
  setQuality(q: Quality): void;
  /** Rough triangle count contributed by chunked terrain (informational). */
  dispose(): void;
}
