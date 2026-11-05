import * as THREE from 'three';
import { sharedUniforms, rgb } from './shared';

export interface WaterOptions {
  /** Optional depth texture (R: 0..1 maps to depth -1..3 below the surface), like the prototype. */
  depthTexture?: THREE.Texture;
  origin?: THREE.Vector2;
  step?: number;
  dims?: THREE.Vector2;
  /** Circular fade: water blends fully into the sky colour at `radius`. */
  fadeRadius?: number;
  fadeCentre?: THREE.Vector2;
  shallow?: number;
  deep?: number;
  /** Multiplies the depth before the shallow-to-deep gradient (small ponds use > 1 so the centre still reads dark). */
  depthScale?: number;
  /** Cel-style sparkle glints and soft ripple rings (cheap, off for the world sea). */
  sparkle?: boolean;
}

const vert = /* glsl */ `
attribute float aShore;
varying vec3 vW; varying float vDist; varying float vShore;
void main(){
  vec4 wp=modelMatrix*vec4(position,1.0); vW=wp.xyz; vShore=aShore;
  vec4 mv=viewMatrix*wp; vDist=length(mv.xyz); gl_Position=projectionMatrix*mv;
}`;

const frag = /* glsl */ `
uniform sampler2D uDepth; uniform vec2 uOrigin,uDims,uCentre; uniform float uStep,uTime,uRadius,uConstDepth;
uniform vec3 uFogCol,uShallow,uDeep; uniform vec2 uFog; uniform float uDepthScale;
varying vec3 vW; varying float vDist; varying float vShore;
float h2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y); }
void main(){
  float d=uConstDepth;
  #ifdef USE_DEPTHTEX
    vec2 uv=((vW.xz-uOrigin)/uStep+0.5)/uDims;
    d=(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0)?3.0:texture2D(uDepth,uv).r*4.0-1.0;
  #endif
  #ifdef USE_SHOREATTR
    d=vShore;
  #endif
  vec2 s1=vW.xz*0.6+vec2(uTime*0.05,uTime*0.03);
  vec2 s2=vW.xz*1.3-vec2(uTime*0.04,-uTime*0.06);
  float dd=d*uDepthScale+(vn(s1)-0.5)*0.3;
  float t=smoothstep(0.0,1.7,dd); t=mix(t,floor(t*3.0+0.5)/3.0,0.55);
  vec3 col=mix(uShallow,uDeep,t);
  float band1=step(0.72,vn(s1*1.5+7.0)*0.5+vn(s2*1.8)*0.5);
  float band2=step(0.80,vn(s2*0.8+uTime*0.02)*0.6+vn(s1*2.3)*0.4);
  col+=0.05*band1+0.035*band2;
  float foam=1.0-smoothstep(0.14,0.20,dd+(vn(vW.xz*3.0+uTime*0.2)-0.5)*0.12);
  // fade out right where the surface meets the ground so the waterline never reads as a hard cut-out
  float edge=smoothstep(0.0,0.07,d);
  float ring=smoothstep(0.40,0.43,dd)*(1.0-smoothstep(0.47,0.50,dd))*0.55;
  #if defined(USE_DEPTHTEX) || defined(USE_SHOREATTR)
    col=mix(col,vec3(0.94,0.99,0.98),max(foam,ring));
  #endif
  float a=mix(0.55,1.0,smoothstep(0.0,1.7,dd));
  #if defined(USE_DEPTHTEX) || defined(USE_SHOREATTR)
    a=max(a,max(foam,ring));
  #else
    a=1.0;
  #endif
  float r=length(vW.xz-uCentre);
  float fade=smoothstep(uRadius*0.78,uRadius,r);
  #ifdef USE_SPARKLE
    vec2 sc=floor(vW.xz*7.0); vec2 sf=fract(vW.xz*7.0)-0.5;
    float tw=step(0.975,h2(sc))*smoothstep(0.25,0.0,length(sf+(vec2(h2(sc+3.0),h2(sc+7.0))-0.5)*0.4))*(0.5+0.5*sin(uTime*2.5+h2(sc+1.0)*40.0));
    col+=tw*0.55*(1.0-fade);
    float rip=smoothstep(0.88,1.0,sin(length(vW.xz-vec2(-5.0,9.0))*5.0-uTime*0.8+vn(vW.xz*2.0)*3.0))*0.06*smoothstep(0.1,0.5,d*uDepthScale);
    col+=rip;
  #endif
  col=mix(col,uFogCol,fade);
  col=mix(col,uFogCol,smoothstep(uFog.x,uFog.y,vDist));
  a*=edge;
  gl_FragColor=vec4(col,mix(a,1.0,fade));
}`;

/**
 * Flat colour water with two scrolling procedural noise bands, shore foam (from `aShore` attribute = depth below the
 * surface, or a depth texture) and a circular fade into the sky colour at `fadeRadius`.
 */
export function createWaterMaterial(opts: WaterOptions = {}): THREE.ShaderMaterial {
  const defines: Record<string, string> = {};
  if (opts.depthTexture) defines['USE_DEPTHTEX'] = '';
  else defines['USE_SHOREATTR'] = '';
  if (opts.sparkle) defines['USE_SPARKLE'] = '';
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    defines,
    uniforms: {
      ...sharedUniforms,
      uDepth: { value: opts.depthTexture ?? null },
      uOrigin: { value: opts.origin ?? new THREE.Vector2() },
      uDims: { value: opts.dims ?? new THREE.Vector2(1, 1) },
      uStep: { value: opts.step ?? 1 },
      uCentre: { value: opts.fadeCentre ?? new THREE.Vector2() },
      uRadius: { value: opts.fadeRadius ?? 1e5 },
      uConstDepth: { value: 3 },
      uDepthScale: { value: opts.depthScale ?? 1 },
      uShallow: { value: rgb(opts.shallow ?? 0x4fd1c7) },
      uDeep: { value: rgb(opts.deep ?? 0x1a6eab) },
    },
    vertexShader: vert,
    fragmentShader: frag,
  });
  m.name = 'water';
  return m;
}
