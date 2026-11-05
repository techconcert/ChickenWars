// Procedural portraits: a canvas recipe seeded by an id (hero or lord). Same id always gives the same face.
// Heroes are chickens (roosters and hens of many breeds, with a class accessory); lords are farm animals (boar, cow, horse, owl, ram, mole).
// UI-only code: it uses its own FNV-1a hash and mulberry32 stream, never the sim RNG, and no Math.random.

const INK = '#3a2f26';
const RED = '#d2423a', BEAK = '#e9a83a';
/** Breed palettes: body, accent (wing and neck hackles), face patch. */
const BREEDS = [
  { name: 'white leghorn', body: '#f6f1e6', accent: '#e4dcc8', ear: '#f4f0e6' },
  { name: 'rhode island red', body: '#b4492c', accent: '#8a3220', ear: '#e8c9a0' },
  { name: 'barred rock', body: '#8d9099', accent: '#5f626b', ear: '#f0d0c0' },
  { name: 'buff orpington', body: '#e6b25a', accent: '#c98d3a', ear: '#f0d8b0' },
  { name: 'black australorp', body: '#3b3b44', accent: '#24242c', ear: '#d8b8a8' },
  { name: 'golden wyandotte', body: '#c98a3a', accent: '#6a4a2a', ear: '#f0d0c0' },
  { name: 'speckled sussex', body: '#a56a4a', accent: '#f0e8dc', ear: '#f0d0c0' },
  { name: 'silkie', body: '#f2eee4', accent: '#d8d2c4', ear: '#6a5a8a' },
] as const;
const CLOTH: Record<string, string[]> = {
  warrior: ['#a83c3c', '#8a4a3a', '#7a3a2a'],
  ranger: ['#4c8a3e', '#3c7a5a', '#6a8a3a'],
  strategist: ['#3c6ea8', '#5a4aa0', '#3c8a9a'],
  lord: ['#4c8a3e', '#3c6ea8', '#a83c3c', '#8a5aa0'],
};
const COMBS = ['single', 'rose', 'crest'] as const;
type Comb = (typeof COMBS)[number];
/** Farm animals used for lord portraits, by lord id; any other id gets a pig. */
const LORD_ANIMAL: Record<string, string> = { lord_hale: 'boar', lady_orsa: 'cow', lord_varn: 'horse', lady_ilse: 'owl', lord_thorn: 'ram', lady_mey: 'mole' };

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PortraitSpec {
  /** 'chicken' for heroes, otherwise the animal name of a lord. */
  kind: string;
  cls: string;
  breed: string; body: string; accent: string; ear: string;
  rooster: boolean; comb: Comb; cloth: string; plate: string;
  eyeGap: number; browTilt: number; headW: number; headH: number;
}

/** Pure description of the face; exported so tests (and the tooltip) can read it without a canvas. */
export function portraitSpec(id: string, cls = 'lord', accent?: string): PortraitSpec {
  const r = rng(hashString(`portrait:${id}`));
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)] as T;
  const cloth = accent ?? pick(CLOTH[cls] ?? CLOTH.lord!);
  const breed = pick(BREEDS);
  const lord = cls === 'lord';
  return {
    kind: lord ? LORD_ANIMAL[id] ?? 'pig' : 'chicken', cls,
    breed: breed.name, body: breed.body, accent: breed.accent, ear: breed.ear,
    rooster: r() < 0.55, comb: pick(COMBS), cloth, plate: pick(['#d8c79a', '#c7d2b0', '#bcc9d6', '#dcc0a8']),
    eyeGap: 0.13 + r() * 0.03, browTilt: 0.02 + r() * 0.03, headW: 0.31 + r() * 0.04, headH: 0.30 + r() * 0.04,
  };
}

type Ctx = CanvasRenderingContext2D;
function shape(c: Ctx, fill: string, lw: number): void { c.fillStyle = fill; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.lineJoin = 'round'; c.stroke(); }
function ell(c: Ctx, x: number, y: number, rx: number, ry: number, fill: string, lw: number, rot = 0): void { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); shape(c, fill, lw); }
function poly(c: Ctx, pts: [number, number][], fill: string, lw: number): void { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); shape(c, fill, lw); }
function eye(c: Ctx, x: number, y: number, r: number, iris = INK): void {
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = iris; c.fill();
  c.beginPath(); c.arc(x - r * 0.3, y - r * 0.35, r * 0.32, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
}

function drawChicken(c: Ctx, p: PortraitSpec, S: number): void {
  const lw = Math.max(1.5, S * 0.025), cx = S / 2;
  // shoulders: feathered chest with a scarf in the class colour
  ell(c, cx, S * 0.98, S * 0.5, S * 0.34, p.body, lw);
  for (const sx of [-1, 1]) ell(c, cx + sx * S * 0.3, S * 0.86, S * 0.13, S * 0.2, p.accent, lw, sx * 0.5);
  poly(c, [[cx - S * 0.2, S * 0.7], [cx + S * 0.2, S * 0.7], [cx + S * 0.27, S * 0.84], [cx, S * 0.9], [cx - S * 0.27, S * 0.84]], p.cloth, lw);
  // rooster tail feathers / hen neck feathers behind the head
  const hy = S * 0.46, hw = p.headW * S, hh = p.headH * S;
  if (p.rooster) for (const [dx, dy, rot] of [[-0.26, -0.1, -0.5], [0.26, -0.1, 0.5], [0, -0.2, 0]] as const) ell(c, cx + dx * S, hy + dy * S, S * 0.07, S * 0.2, p.accent, lw, rot);
  // comb behind the head (single or rose), wattles in front
  const combCol = RED;
  if (p.comb === 'single' || p.comb === 'rose') {
    const n = p.rooster ? 5 : 3, w = hw * (p.rooster ? 1.15 : 0.7), top = hy - hh * (p.rooster ? 1.55 : 1.3);
    const pts: [number, number][] = [[cx - w, hy - hh * 0.85]];
    for (let i = 0; i < n; i++) { const x = cx - w + ((i + 0.5) / n) * 2 * w; pts.push([x - w / n * 0.5, top + hh * 0.35], [x, top + (i % 2) * hh * 0.1], [x + w / n * 0.5, top + hh * 0.35]); }
    pts.push([cx + w, hy - hh * 0.85]);
    poly(c, pts, combCol, lw);
  }
  // head
  ell(c, cx, hy, hw, hh, p.body, lw);
  if (p.comb === 'crest') { for (const [dx, dy, r] of [[-0.12, -1.0, 0.2], [0, -1.15, 0.24], [0.12, -1.0, 0.2], [-0.2, -0.8, 0.16], [0.2, -0.8, 0.16]] as const) ell(c, cx + dx * S, hy + dy * hh, hw * r * 1.5, hw * r * 1.4, p.accent, lw * 0.8); }
  // face patch (roosters have a red face mask around the eyes) and earlobes
  if (p.rooster) ell(c, cx, hy + hh * 0.02, hw * 0.62, hh * 0.45, '#e8695a', lw * 0.6);
  for (const sx of [-1, 1]) ell(c, cx + sx * hw * 0.92, hy + hh * 0.3, hw * 0.13, hh * 0.2, p.ear, lw * 0.8);
  // eyes and brows
  const ey = hy - hh * 0.05, gap = p.eyeGap * S;
  for (const sx of [-1, 1]) {
    eye(c, cx + sx * gap, ey, S * 0.034, '#2a1d14');
    c.beginPath(); c.moveTo(cx + sx * (gap - S * 0.05), ey - S * 0.06 + sx * p.browTilt * S); c.lineTo(cx + sx * (gap + S * 0.05), ey - S * 0.06 - sx * p.browTilt * S);
    c.lineWidth = lw * 1.2; c.strokeStyle = p.body === '#3b3b44' ? '#d8d8e0' : INK; c.stroke();
  }
  // beak (upper bigger, lower small) and wattles
  poly(c, [[cx - S * 0.06, hy + hh * 0.25], [cx + S * 0.06, hy + hh * 0.25], [cx, hy + hh * 0.75]], BEAK, lw);
  poly(c, [[cx - S * 0.04, hy + hh * 0.62], [cx + S * 0.04, hy + hh * 0.62], [cx, hy + hh * 0.9]], '#d28a2a', lw * 0.8);
  if (p.rooster) for (const sx of [-1, 1]) ell(c, cx + sx * S * 0.035, hy + hh * 0.98, S * 0.03, S * 0.07, RED, lw * 0.8);
  // class accessory (the comb stays visible)
  if (p.cls === 'warrior') { // red-ish war bandana across the forehead with a knot and a spur
    poly(c, [[cx - hw * 1.0, hy - hh * 0.42], [cx + hw * 1.0, hy - hh * 0.42], [cx + hw * 0.95, hy - hh * 0.22], [cx - hw * 0.95, hy - hh * 0.22]], p.cloth, lw);
    poly(c, [[cx + hw * 0.95, hy - hh * 0.32], [cx + hw * 1.3, hy - hh * 0.5], [cx + hw * 1.25, hy - hh * 0.12]], p.cloth, lw);
    c.beginPath(); c.arc(cx, hy - hh * 0.32, S * 0.02, 0, Math.PI * 2); c.fillStyle = '#e3b341'; c.fill();
  } else if (p.cls === 'ranger') { // green headband with a long feather
    poly(c, [[cx - hw * 1.0, hy - hh * 0.44], [cx + hw * 1.0, hy - hh * 0.44], [cx + hw * 0.95, hy - hh * 0.26], [cx - hw * 0.95, hy - hh * 0.26]], p.cloth, lw);
    ell(c, cx + hw * 0.85, hy - hh * 0.95, S * 0.035, S * 0.14, '#f2e8d0', lw * 0.8, 0.5);
    ell(c, cx + hw * 0.85, hy - hh * 0.95, S * 0.012, S * 0.13, '#c9433a', lw * 0.4, 0.5);
  } else if (p.cls === 'strategist') { // monocle on a chain and a scholar's scarf
    c.beginPath(); c.arc(cx + gap, ey, S * 0.065, 0, Math.PI * 2); c.lineWidth = lw * 1.2; c.strokeStyle = '#c9a24a'; c.stroke();
    c.beginPath(); c.moveTo(cx + gap + S * 0.05, ey + S * 0.05); c.lineTo(cx + gap + S * 0.08, ey + S * 0.22); c.lineWidth = lw * 0.8; c.stroke();
    poly(c, [[cx - hw * 0.9, hy - hh * 0.5], [cx + hw * 0.9, hy - hh * 0.5], [cx + hw * 0.7, hy - hh * 0.36], [cx - hw * 0.7, hy - hh * 0.36]], p.cloth, lw);
  }
  c.lineWidth = lw * 1.4; c.strokeStyle = INK; c.strokeRect(0, 0, S, S);
}

function drawAnimal(c: Ctx, p: PortraitSpec, S: number): void {
  const lw = Math.max(1.5, S * 0.025), cx = S / 2, hy = S * 0.5;
  // banner-coloured tunic at the bottom
  ell(c, cx, S * 1.02, S * 0.48, S * 0.28, p.cloth, lw);
  const at = p.kind;
  const nostrils = (x: number, y: number, r: number): void => { for (const sx of [-1, 1]) { c.beginPath(); c.arc(x + sx * r * 0.9, y, r * 0.35, 0, Math.PI * 2); c.fillStyle = INK; c.fill(); } };
  if (at === 'boar' || at === 'pig') {
    const skin = at === 'boar' ? '#8a7466' : '#f0a8b4';
    for (const sx of [-1, 1]) poly(c, [[cx + sx * S * 0.2, hy - S * 0.2], [cx + sx * S * 0.36, hy - S * 0.36], [cx + sx * S * 0.34, hy - S * 0.08]], at === 'boar' ? '#6a5648' : '#e08a9a', lw);
    ell(c, cx, hy, S * 0.3, S * 0.3, skin, lw);
    ell(c, cx, hy + S * 0.1, S * 0.17, S * 0.12, '#e58b9c', lw);
    nostrils(cx, hy + S * 0.1, S * 0.04);
    for (const sx of [-1, 1]) { eye(c, cx + sx * S * 0.14, hy - S * 0.07, S * 0.03); if (at === 'boar') poly(c, [[cx + sx * S * 0.13, hy + S * 0.14], [cx + sx * S * 0.2, hy + S * 0.02], [cx + sx * S * 0.17, hy + S * 0.18]], '#f2ead0', lw * 0.8); }
  } else if (at === 'cow') {
    for (const sx of [-1, 1]) { poly(c, [[cx + sx * S * 0.2, hy - S * 0.22], [cx + sx * S * 0.3, hy - S * 0.4], [cx + sx * S * 0.12, hy - S * 0.28]], '#efe6c8', lw); ell(c, cx + sx * S * 0.34, hy - S * 0.1, S * 0.1, S * 0.06, '#f3f0ea', lw, sx * 0.4); }
    ell(c, cx, hy, S * 0.27, S * 0.3, '#f6f3ee', lw);
    ell(c, cx - S * 0.12, hy - S * 0.12, S * 0.09, S * 0.12, '#33323a', lw * 0.6, 0.4);
    ell(c, cx, hy + S * 0.15, S * 0.19, S * 0.12, '#f0a8b4', lw);
    nostrils(cx, hy + S * 0.15, S * 0.04);
    for (const sx of [-1, 1]) eye(c, cx + sx * S * 0.13, hy - S * 0.07, S * 0.03);
  } else if (at === 'horse') {
    ell(c, cx, hy - S * 0.2, S * 0.2, S * 0.2, '#4a2e1c', lw); // mane behind
    for (const sx of [-1, 1]) poly(c, [[cx + sx * S * 0.12, hy - S * 0.3], [cx + sx * S * 0.2, hy - S * 0.5], [cx + sx * S * 0.04, hy - S * 0.34]], '#8a5a3a', lw);
    ell(c, cx, hy + S * 0.02, S * 0.2, S * 0.34, '#8a5a3a', lw);
    ell(c, cx, hy - S * 0.02, S * 0.05, S * 0.3, '#f4efe4', lw * 0.5);
    ell(c, cx, hy + S * 0.28, S * 0.14, S * 0.09, '#6a4429', lw);
    nostrils(cx, hy + S * 0.28, S * 0.035);
    for (const sx of [-1, 1]) eye(c, cx + sx * S * 0.12, hy - S * 0.1, S * 0.028);
  } else if (at === 'owl') {
    for (const sx of [-1, 1]) poly(c, [[cx + sx * S * 0.14, hy - S * 0.22], [cx + sx * S * 0.3, hy - S * 0.42], [cx + sx * S * 0.28, hy - S * 0.12]], '#6a4a30', lw);
    ell(c, cx, hy, S * 0.32, S * 0.31, '#8a6a46', lw);
    for (const sx of [-1, 1]) { ell(c, cx + sx * S * 0.14, hy - S * 0.04, S * 0.13, S * 0.13, '#f1e3b8', lw); eye(c, cx + sx * S * 0.14, hy - S * 0.04, S * 0.06, '#e3b341'); c.beginPath(); c.arc(cx + sx * S * 0.14, hy - S * 0.04, S * 0.028, 0, Math.PI * 2); c.fillStyle = INK; c.fill(); }
    poly(c, [[cx - S * 0.05, hy + S * 0.06], [cx + S * 0.05, hy + S * 0.06], [cx, hy + S * 0.17]], BEAK, lw);
  } else if (at === 'ram') {
    for (const sx of [-1, 1]) { c.beginPath(); c.arc(cx + sx * S * 0.27, hy - S * 0.06, S * 0.17, 0, Math.PI * 2); c.lineWidth = S * 0.07; c.strokeStyle = '#c9b48a'; c.stroke(); c.lineWidth = lw * 0.6; c.strokeStyle = INK; c.stroke(); }
    for (const [dx, dy] of [[-0.18, -0.26], [0, -0.32], [0.18, -0.26], [-0.26, -0.1], [0.26, -0.1]] as const) ell(c, cx + dx * S, hy + dy * S, S * 0.11, S * 0.1, '#f1ead8', lw * 0.8);
    ell(c, cx, hy + S * 0.04, S * 0.2, S * 0.27, '#5a4a40', lw);
    ell(c, cx, hy + S * 0.2, S * 0.1, S * 0.07, '#d8a8a0', lw);
    for (const sx of [-1, 1]) eye(c, cx + sx * S * 0.1, hy - S * 0.02, S * 0.026, '#e3b341');
  } else if (at === 'mole') {
    ell(c, cx, hy, S * 0.3, S * 0.29, '#4a4650', lw);
    poly(c, [[cx - S * 0.08, hy + S * 0.02], [cx + S * 0.08, hy + S * 0.02], [cx, hy + S * 0.24]], '#e8a0a8', lw);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; c.beginPath(); c.moveTo(cx, hy + S * 0.24); c.lineTo(cx + Math.cos(a) * S * 0.05, hy + S * 0.24 + Math.sin(a) * S * 0.05); c.lineWidth = lw * 0.7; c.strokeStyle = '#e8a0a8'; c.stroke(); }
    for (const sx of [-1, 1]) { eye(c, cx + sx * S * 0.11, hy - S * 0.06, S * 0.014); ell(c, cx + sx * S * 0.36, hy + S * 0.38, S * 0.09, S * 0.06, '#e8a0a8', lw, sx * 0.6); }
  }
  c.lineWidth = lw * 1.4; c.strokeStyle = INK; c.strokeRect(0, 0, S, S);
}

function draw(c: Ctx, p: PortraitSpec, S: number): void {
  c.fillStyle = p.plate; c.fillRect(0, 0, S, S);
  if (p.kind === 'chicken') drawChicken(c, p, S); else drawAnimal(c, p, S);
}

const cache = new Map<string, string>();

/** Data URL of the portrait for `id`; '' without a DOM. `accent` tints the clothing (lord banner colour). */
export function portraitUrl(id: string, size = 64, cls = 'lord', accent?: string): string {
  const key = `${id}|${size}|${cls}|${accent ?? ''}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let url = '';
  if (typeof document !== 'undefined') {
    const px = size * 2;
    const cv = document.createElement('canvas');
    cv.width = px; cv.height = px;
    const c = cv.getContext('2d');
    if (c) { draw(c, portraitSpec(id, cls, accent), px); url = cv.toDataURL('image/png'); }
  }
  cache.set(key, url);
  return url;
}
