import * as THREE from 'three';
import { FOW_GLSL, INSTANCE_GLSL, fowUniforms, sharedUniforms } from './shared';

export interface CelOptions {
  /** 3 (default) or 4 hard light bands on N.L. */
  bands?: 3 | 4;
  /** Sample the world fog-of-war texture (world scene). */
  fogOfWar?: boolean;
  /** 0..1 brighten amount; per-material (hover variants use a second material). */
  highlight?: number;
  /** Terrain mode: steep triangles are shaded with their flat face normal (crisp faceted cliffs). */
  faceted?: boolean;
  /** Apply snow / autumn season uniforms (default true). */
  seasonal?: boolean;
}

const vert = /* glsl */ `
${INSTANCE_GLSL}
uniform float uLeaf;
attribute float aEmit;
varying vec3 vN; varying vec3 vCol; varying vec3 vWorld; varying float vDist; varying float vEmit;
void main(){
  vec3 c=color; vec4 wp; vec3 wn;
  #ifdef USE_INSTANCING
    wp=modelMatrix*(instanceMatrix*vec4(position,1.0)); wn=mat3(modelMatrix)*instNormal(normal,instanceMatrix);
  #else
    wp=modelMatrix*vec4(position,1.0); wn=mat3(modelMatrix)*normal;
  #endif
  #ifdef USE_INSTANCING_COLOR
    c*=instanceColor;
  #endif
  #ifdef SEASONAL
    float gr=smoothstep(0.02,0.12,c.g-max(c.r,c.b));
    vec3 amber=vec3(c.g*1.22,c.g*0.74,c.g*0.30);
    c=mix(c,amber,uLeaf*gr);
  #endif
  vN=normalize(wn); vCol=c; vWorld=wp.xyz; vEmit=aEmit;
  vec4 mv=viewMatrix*wp; vDist=length(mv.xyz);
  gl_Position=projectionMatrix*mv;
}`;

const frag = /* glsl */ `
uniform vec3 uLightDir,uLightCol,uSky,uGround,uFogCol; uniform vec2 uFog;
uniform float uSnow,uHighlight;
${FOW_GLSL}
varying vec3 vN; varying vec3 vCol; varying vec3 vWorld; varying float vDist; varying float vEmit;
void main(){
  vec3 n=normalize(vN);
  #ifdef FACET
    vec3 fnrm=normalize(cross(dFdx(vWorld),dFdy(vWorld)));
    if(fnrm.y<0.0) fnrm=-fnrm;
    n=normalize(mix(n,fnrm,1.0-smoothstep(0.55,0.86,n.y)));
  #endif
  float nl=dot(n,uLightDir);
  const float W=0.02;
  #if BANDS==4
    float b1=smoothstep(-0.05-W,-0.05+W,nl), b2=smoothstep(0.30-W,0.30+W,nl), b3=smoothstep(0.62-W,0.62+W,nl);
    float lv=mix(mix(mix(0.56,0.72,b1),0.88,b2),1.0,b3);
    vec3 tint=mix(mix(vec3(0.88,0.93,1.06),vec3(1.0),b2),vec3(1.03,1.0,0.92),b3);
  #else
    float b1=smoothstep(0.18-W,0.18+W,nl), b2=smoothstep(0.55-W,0.55+W,nl);
    float lv=mix(mix(0.60,0.80,b1),1.0,b2);
    vec3 tint=mix(mix(vec3(0.88,0.93,1.06),vec3(1.0),b1),vec3(1.03,1.0,0.92),b2);
  #endif
  vec3 fill=mix(uGround,uSky,n.y*0.5+0.5);
  vec3 base=vCol;
  #ifdef SEASONAL
    base=mix(base,vec3(0.97,0.98,1.0),uSnow*smoothstep(0.45,0.8,n.y));
  #endif
  vec3 col=base*lv*tint*fill*mix(vec3(1.0),uLightCol,b1);
  col*=1.0-0.4*(1.0-smoothstep(-0.9,-0.1,n.y));
  col=mix(col,base,clamp(vEmit,0.0,1.0));
  col=col*(1.0+uHighlight*0.28)+vec3(1.0,0.93,0.75)*uHighlight*0.12;
  #ifdef USE_FOW
    vec2 fs=fowState(vWorld);
    float g=dot(col,vec3(0.3,0.59,0.11));
    vec3 explored=mix(vec3(g),col,0.4)*0.95+vec3(0.04);
    col=mix(explored,col,fs.y);
    float fm=1.0-(1.0-fs.x)*(1.0-fs.x);
    col=mix(col,parchment(vWorld,clamp((lv-0.6)*2.5,0.0,1.0),fm),fm*0.98);
  #endif
  col=mix(col,uFogCol,smoothstep(uFog.x,uFog.y,vDist));
  gl_FragColor=vec4(col,1.0);
}`;

/** Cel-shaded material: hard N.L bands, coloured ambient floor, vertex colours, season + fog-of-war + hover uniforms. */
export function createCelMaterial(opts: CelOptions = {}): THREE.ShaderMaterial {
  const defines: Record<string, string | number> = { BANDS: opts.bands ?? 3 };
  if (opts.fogOfWar) defines['USE_FOW'] = '';
  if (opts.faceted) defines['FACET'] = '';
  if (opts.seasonal !== false) defines['SEASONAL'] = '';
  const uniforms: Record<string, THREE.IUniform> = { ...sharedUniforms, uHighlight: { value: opts.highlight ?? 0 } };
  if (opts.fogOfWar) Object.assign(uniforms, fowUniforms);
  else Object.assign(uniforms, { uFowTex: fowUniforms.uFowTex, uFowBounds: fowUniforms.uFowBounds });
  const m = new THREE.ShaderMaterial({ vertexColors: true, defines, uniforms, vertexShader: vert, fragmentShader: frag });
  m.name = 'cel';
  return m;
}

const cache = new Map<string, THREE.ShaderMaterial>();
/** Shared cached cel materials; `hover` is a brightened twin used by hover helpers. */
export function getCelMaterial(kind: { fogOfWar?: boolean; hover?: boolean; terrain?: boolean } = {}): THREE.ShaderMaterial {
  const key = `${kind.fogOfWar ? 'f' : 'p'}${kind.hover ? 'h' : ''}${kind.terrain ? 't' : ''}`;
  let m = cache.get(key);
  if (!m) {
    m = createCelMaterial({ fogOfWar: kind.fogOfWar, highlight: kind.hover ? 0.7 : 0, faceted: kind.terrain });
    cache.set(key, m);
  }
  return m;
}
