// Town life (D48): plain typed-array state of the ambient NPCs (no logic). Shared by the state machine and the drawing code.
import * as THREE from 'three';
import { CIV_CAP, EXP_CAP, SOL_CAP, type Pose } from '../../view/townLife';

export const SOL_BASE = CIV_CAP;
export const EXP_BASE = CIV_CAP + SOL_CAP;
export const N = CIV_CAP + SOL_CAP + EXP_CAP;
export const MAX_GROUPS = 3;
export const MAX_STOPS = 3;

export interface TownLifeStats { active: number; visible: number; drawCalls: number; updateMs: number; obstacles: number }

export class NpcData {
  // per-NPC state
  act = new Uint8Array(N); role = new Uint8Array(N);
  px = new Float32Array(N); pz = new Float32Array(N); hd = new Float32Array(N);
  ph = new Float32Array(N); spd = new Float32Array(N);
  bed = new Float32Array(N); wake = new Float32Array(N);
  task = new Uint8Array(N); stage = new Uint8Array(N); stop = new Uint8Array(N); nStops = new Uint8Array(N);
  timer = new Float32Array(N); anim = new Uint8Array(N); prop = new Uint8Array(N);
  gait = new Float32Array(N); stepPh = new Float32Array(N); sleepK = new Float32Array(N);
  hasV = new Uint8Array(N); vx = new Float32Array(N); vz = new Float32Array(N); vt = new Float32Array(N);
  stuck = new Float32Array(N); leader = new Int16Array(N); grp = new Int8Array(N); slot = new Uint8Array(N);
  rx = new Float32Array(N * MAX_STOPS); rz = new Float32Array(N * MAX_STOPS); rt = new Float32Array(N * MAX_STOPS);
  rf = new Float32Array(N * MAX_STOPS); ra = new Uint8Array(N * MAX_STOPS);
  // groups (soldiers)
  gN = 0; gx = new Float32Array(MAX_GROUPS); gz = new Float32Array(MAX_GROUPS); gh = new Float32Array(MAX_GROUPS);
  gbx = new Float32Array(MAX_GROUPS); gbz = new Float32Array(MAX_GROUPS); gmode = new Uint8Array(MAX_GROUPS);
  gtimer = new Float32Array(MAX_GROUPS); gwp = new Uint8Array(MAX_GROUPS); gform = new Uint8Array(MAX_GROUPS);
  gfirst = new Uint8Array(MAX_GROUPS); gcount = new Uint8Array(MAX_GROUPS); grole = new Uint8Array(MAX_GROUPS);
  gbed = new Float32Array(MAX_GROUPS); gwake = new Float32Array(MAX_GROUPS); gsp = new Float32Array(MAX_GROUPS);
  // outskirts chicks: sub-mode, mode timer, circle angle + centre of the play spot
  xmode = new Uint8Array(N); xtimer = new Float32Array(N); xang = new Float32Array(N); xcx = new Float32Array(N); xcz = new Float32Array(N);
  // points of interest
  fx: number[] = []; fz: number[] = []; fk: number[] = []; nF = 0;
  obX: number[] = []; obZ: number[] = []; obR: number[] = [];
  farmX: number[] = []; farmZ: number[] = [];
  pondX: number[] = []; pondZ: number[] = []; pondF: number[] = [];
  treeX: number[] = []; treeZ: number[] = []; treeF: number[] = [];
  flags = 0;
  nCiv = 0; nSol = 0;
  sig = -1; lastCheck = -9;
  nExp = 0; thX = 0; thZ = 0; terrR = 0; thCell = -1;
  // scratch
  pose: Pose = { pitch: 0, bob: 0, fwd: 0, swing: 0, yaw: 0 };
  o2 = [0, 0]; s2 = [0, 0];
  mR = new THREE.Matrix4(); mB = new THREE.Matrix4(); mA = new THREE.Matrix4(); mC = new THREE.Matrix4(); mD = new THREE.Matrix4();
  q = new THREE.Quaternion(); e = new THREE.Euler(0, 0, 0, 'YXZ'); v3 = new THREE.Vector3(); sc = new THREE.Vector3();
  fr = new THREE.Frustum(); pm = new THREE.Matrix4(); sp = new THREE.Sphere(new THREE.Vector3(), 0.8);
  stats: TownLifeStats = { active: 0, visible: 0, drawCalls: 0, updateMs: 0, obstacles: 0 };
}
