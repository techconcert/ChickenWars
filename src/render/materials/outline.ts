import * as THREE from 'three';
import { FOW_GLSL, INSTANCE_GLSL, fowUniforms, sharedUniforms, rgb } from './shared';
import { ensureSmoothNormals } from './smooth';

const vert = /* glsl */ `
${INSTANCE_GLSL}
attribute vec3 aSmooth; uniform float uThick, uRef; uniform vec3 uCol; uniform float uDark;
varying vec3 vC; varying vec3 vWorld; varying float vDist;
void main(){
  vec4 wp; vec3 wn;
  #ifdef USE_INSTANCING
    wp=modelMatrix*(instanceMatrix*vec4(position,1.0)); wn=mat3(modelMatrix)*instNormal(aSmooth,instanceMatrix);
  #else
    wp=modelMatrix*vec4(position,1.0); wn=mat3(modelMatrix)*aSmooth;
  #endif
  #ifdef VCOL
    vC=color*uDark;
  #else
    vC=uCol;
  #endif
  float dist=length((viewMatrix*wp).xyz);
  wp.xyz+=normalize(wn)*uThick*clamp(dist/uRef,0.2,6.0);
  vWorld=wp.xyz;
  vec4 mv=viewMatrix*wp; vDist=length(mv.xyz);
  gl_Position=projectionMatrix*mv;
}`;

const frag = /* glsl */ `
uniform vec3 uFogCol; uniform vec2 uFog;
${FOW_GLSL}
varying vec3 vC; varying vec3 vWorld; varying float vDist;
void main(){
  vec3 col=vC;
  #ifdef USE_FOW
    vec2 fs=fowState(vWorld);
    col=mix(col,vec3(0.80,0.76,0.67),fs.x*0.97);
  #endif
  gl_FragColor=vec4(mix(col,uFogCol,smoothstep(uFog.x,uFog.y,vDist)),1.0);
}`;

export interface OutlineOptions {
  /** Distance (world units) at which thickness equals `thickness`; scales linearly, clamped to 0.2x..6x. Default 30. */
  refDistance?: number;
  fogOfWar?: boolean;
}

/**
 * Inverted-hull outline material. `colour` fixed hex, or `null` to use each vertex's own colour darkened to 30%
 * (the art direction: outline = darkened base colour, never pure black). Thickness is in world units at `refDistance`.
 */
export function createOutlineMaterial(colour: number | null, thickness: number, opts: OutlineOptions = {}): THREE.ShaderMaterial {
  const defines: Record<string, string> = {};
  if (colour === null) defines['VCOL'] = '';
  if (opts.fogOfWar) defines['USE_FOW'] = '';
  const uniforms: Record<string, THREE.IUniform> = {
    ...sharedUniforms,
    uCol: { value: rgb(colour ?? 0) },
    uThick: { value: thickness },
    uRef: { value: opts.refDistance ?? 30 },
    uDark: { value: 0.3 },
    uFowTex: fowUniforms.uFowTex,
    uFowBounds: fowUniforms.uFowBounds,
  };
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, vertexColors: colour === null, defines, uniforms, vertexShader: vert, fragmentShader: frag,
  });
  m.name = 'outline';
  return m;
}

const cache = new Map<string, THREE.ShaderMaterial>();
export function getOutlineMaterial(colour: number | null, thickness: number, fogOfWar = false): THREE.ShaderMaterial {
  const key = `${colour ?? 'v'}|${thickness}|${fogOfWar ? 1 : 0}`;
  let m = cache.get(key);
  if (!m) {
    m = createOutlineMaterial(colour, thickness, { fogOfWar });
    cache.set(key, m);
  }
  return m;
}

/** Adds an inverted-hull child to `mesh` (computes welded smooth normals on its geometry if missing). */
export function addOutline(mesh: THREE.Mesh, thickness: number, colour: number | null = null, fogOfWar = false): THREE.Mesh {
  ensureSmoothNormals(mesh.geometry);
  const hull = new THREE.Mesh(mesh.geometry, getOutlineMaterial(colour, thickness, fogOfWar));
  hull.name = 'outline';
  hull.userData['isOutline'] = true;
  hull.userData['thickness'] = thickness;
  hull.userData['colour'] = colour;
  hull.renderOrder = mesh.renderOrder;
  mesh.add(hull);
  return hull;
}
