import * as THREE from 'three';

/**
 * Colour management is disabled on purpose (docs/03-art-direction.md, prototype): the palette is painted in raw sRGB
 * numbers and the cel shader writes them straight to the framebuffer, so what you paint is what you see.
 * Importing any material module sets this flag; it must stay false for the whole renderer.
 */
THREE.ColorManagement.enabled = false;

export const rgb = (hex: number): THREE.Vector3 =>
  new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);

/**
 * Uniforms shared by every cel / outline / water material. Materials spread this object into their own `uniforms`,
 * which copies the `{ value }` references, so one write per frame updates every material in every scene.
 */
export const sharedUniforms = {
  uTime: { value: 0 },
  uLightDir: { value: new THREE.Vector3(0.45, 0.78, 0.43).normalize() },
  uLightCol: { value: new THREE.Vector3(1, 1, 1) },
  uSky: { value: new THREE.Vector3(1.02, 1.03, 1.06) },
  uGround: { value: new THREE.Vector3(0.84, 0.81, 0.77) },
  uFogCol: { value: rgb(0xbfe0e4) },
  uFog: { value: new THREE.Vector2(420, 900) },
  /** 0..1, snow tint on up-facing surfaces (winter). */
  uSnow: { value: 0 },
  /** 0..1, green vertex colours shift to amber (autumn). */
  uLeaf: { value: 0 },
};

export interface SeasonLook {
  snowBlend: number;
  leafShift: number;
  sunDir?: THREE.Vector3;
  sunColour?: number;
  sky?: THREE.Vector3;
  ground?: THREE.Vector3;
  fogColour?: number;
}

/** Update the season / light uniforms once per frame (or when the season changes). */
export function setSeasonLook(s: SeasonLook): void {
  sharedUniforms.uSnow.value = s.snowBlend;
  sharedUniforms.uLeaf.value = s.leafShift;
  if (s.sunDir) sharedUniforms.uLightDir.value.copy(s.sunDir).normalize();
  if (s.sunColour !== undefined) sharedUniforms.uLightCol.value.copy(rgb(s.sunColour));
  if (s.sky) sharedUniforms.uSky.value.copy(s.sky);
  if (s.ground) sharedUniforms.uGround.value.copy(s.ground);
  if (s.fogColour !== undefined) sharedUniforms.uFogCol.value.copy(rgb(s.fogColour));
}

export function setTime(seconds: number): void {
  sharedUniforms.uTime.value = seconds;
}

/**
 * Fog of war uniforms (world scene). Texture: red channel 0 = unexplored, ~0.5 = explored, 1 = visible.
 * Bounds: x = world min X, y = world min Z, z = world width, w = world depth.
 */
const emptyFow = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat);
emptyFow.needsUpdate = true;
export const fowUniforms = {
  uFowTex: { value: emptyFow as THREE.Texture },
  uFowBounds: { value: new THREE.Vector4(-100, -100, 200, 200) },
};

export interface FogOfWarTexture {
  texture: THREE.DataTexture;
  data: Uint8Array;
  width: number;
  height: number;
}

/** Low-res fog texture; write 0/128/255 into `data`, set `texture.needsUpdate = true`, then call `bindFogOfWar`. */
export function createFogTexture(width: number, height: number): FogOfWarTexture {
  const data = new Uint8Array(width * height);
  const texture = new THREE.DataTexture(data, width, height, THREE.RedFormat);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return { texture, data, width, height };
}

export function bindFogOfWar(tex: THREE.Texture, minX: number, minZ: number, sizeX: number, sizeZ: number): void {
  fowUniforms.uFowTex.value = tex;
  fowUniforms.uFowBounds.value.set(minX, minZ, sizeX, sizeZ);
}

export const INSTANCE_GLSL = /* glsl */ `
vec3 instNormal(vec3 n, mat4 im){
  float s0=dot(im[0].xyz,im[0].xyz), s1=dot(im[1].xyz,im[1].xyz), s2=dot(im[2].xyz,im[2].xyz);
  return im[0].xyz*(n.x/s0)+im[1].xyz*(n.y/s1)+im[2].xyz*(n.z/s2);
}`;

/**
 * Fragment helpers for the fog of war: `fowState` returns (x = unexplored 0..1, y = visible 0..1) from the blurred fog
 * texture; `parchment` paints the unexplored look as a soft painted map (smooth low-frequency value noise only, so it
 * never aliases or forms a checker pattern at any zoom), with an ink-stained rim where the fog meets explored land.
 */
export const FOW_GLSL = /* glsl */ `
uniform sampler2D uFowTex; uniform vec4 uFowBounds;
vec2 fowState(vec3 wp){
  float f=texture2D(uFowTex,(wp.xz-uFowBounds.xy)/uFowBounds.zw).r;
  return vec2(1.0-smoothstep(0.08,0.5,f), smoothstep(0.55,0.92,f));
}
float fowHash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float fowNoise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(fowHash(i),fowHash(i+vec2(1.0,0.0)),f.x),mix(fowHash(i+vec2(0.0,1.0)),fowHash(i+vec2(1.0,1.0)),f.x),f.y); }
vec3 parchment(vec3 wp,float relief01,float unexplored){
  float a=fowNoise(wp.xz*0.035)*0.55+fowNoise(wp.xz*0.085+7.0)*0.3+fowNoise(wp.xz*0.19+3.0)*0.15;
  vec3 c=mix(vec3(0.87,0.82,0.70),vec3(0.77,0.70,0.56),smoothstep(0.25,0.8,a));
  c*=mix(0.9,1.0,relief01);
  float rim=unexplored*(1.0-unexplored)*4.0;
  return mix(c,vec3(0.66,0.54,0.38),rim*0.4);
}`;
