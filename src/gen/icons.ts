/**
 * Runtime icon recipes drawn to a canvas (no image files). Pure DOM canvas, no three.js.
 * `getIcon(id, size)` returns a cached data URL, or '' when no DOM is available (node, workers without OffscreenCanvas).
 * Recipes draw in a 64x64 design space: a coloured plate with a dark rim and a white/cream glyph with an ink outline.
 */

type Ctx = CanvasRenderingContext2D;
type Draw = (c: Ctx) => void;
interface Recipe {
  plate: string;
  /** drawn as a free-standing sprite on the full 64x64 space, no round plate */
  bare?: boolean;
  draw: Draw;
}

const INK = '#3a2f26';
const CREAM = '#f6edd2';
const GOLD = '#e3b341';

/** Fill + ink stroke for the current path. */
function paint(c: Ctx, fill: string, lw = 2.2): void {
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = lw;
  c.strokeStyle = INK;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.stroke();
}
function poly(c: Ctx, pts: number[], fill: string, lw?: number): void {
  c.beginPath();
  c.moveTo(pts[0] ?? 0, pts[1] ?? 0);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i] ?? 0, pts[i + 1] ?? 0);
  c.closePath();
  paint(c, fill, lw);
}
function circle(c: Ctx, x: number, y: number, r: number, fill: string, lw?: number): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  paint(c, fill, lw);
}
function rect(c: Ctx, x: number, y: number, w: number, h: number, fill: string, r = 2, lw?: number): void {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  paint(c, fill, lw);
}
function line(c: Ctx, x0: number, y0: number, x1: number, y1: number, col = INK, lw = 3): void {
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.strokeStyle = col;
  c.lineWidth = lw;
  c.lineCap = 'round';
  c.stroke();
}
function ellipse(c: Ctx, x: number, y: number, rx: number, ry: number, rot: number, fill: string): void {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  paint(c, fill, 2);
}

const sword = (c: Ctx, x: number, y: number, ang: number): void => {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  poly(c, [-3, -22, 3, -22, 3, 8, -3, 8], '#e7ecf1');
  rect(c, -9, 8, 18, 4, GOLD, 1.5);
  rect(c, -2.5, 12, 5, 9, '#7a5538', 1.5);
  c.restore();
};

const recipes: Record<string, Recipe> = {
  wheat: { plate: '', bare: true, draw: (c) => {
    poly(c, [32, 60, 11, 46, 8, 24, 24, 40], '#6fb04a');
    poly(c, [32, 60, 53, 46, 56, 24, 40, 40], '#5a9c3c');
    ellipse(c, 32, 31, 12, 23, 0, '#ffd23f');
    for (let r = 0; r < 5; r++) for (let q = -1; q <= 1; q++) circle(c, 32 + q * 6 - (r % 2) * 3, 16 + r * 8, 2, '#f0a81c', 0.7);
    line(c, 25, 14, 25, 38, 'rgba(255,255,255,0.65)', 3);
    poly(c, [32, 60, 24, 36, 32, 46, 40, 36], '#7cc455', 1.8);
  } },
  log: { plate: '', bare: true, draw: (c) => {
    line(c, 12, 54, 46, 8, INK, 11); line(c, 12, 54, 46, 8, '#b88252', 7);
    line(c, 24, 58, 54, 22, INK, 11); line(c, 24, 58, 54, 22, '#a87245', 7);
    line(c, 8, 38, 36, 6, INK, 11); line(c, 8, 38, 36, 6, '#c99462', 7);
    line(c, 14, 50, 44, 12, 'rgba(255,255,255,0.35)', 2);
    line(c, 16, 38, 38, 52, INK, 8); line(c, 16, 38, 38, 52, '#d9504a', 4.5);
    ellipse(c, 46, 14, 9, 5, -0.7, '#6fb04a'); line(c, 40, 20, 52, 8, INK, 1.4);
  } },
  rock: { plate: '', bare: true, draw: (c) => {
    ellipse(c, 24, 42, 18, 14, 0, '#b8b4ac');
    ellipse(c, 46, 48, 12, 9, 0, '#9c988f');
    ellipse(c, 38, 26, 11, 9, 0.3, '#cbc7be');
    line(c, 14, 36, 22, 32, 'rgba(255,255,255,0.7)', 3.4);
    line(c, 33, 22, 38, 20, 'rgba(255,255,255,0.7)', 2.6);
    line(c, 42, 44, 48, 43, 'rgba(255,255,255,0.45)', 2.2);
  } },
  coin: { plate: '', bare: true, draw: (c) => {
    c.beginPath();
    c.moveTo(32, 5); c.bezierCurveTo(46, 5, 54, 30, 53, 42); c.bezierCurveTo(52, 54, 43, 60, 32, 60);
    c.bezierCurveTo(21, 60, 12, 54, 11, 42); c.bezierCurveTo(10, 30, 18, 5, 32, 5);
    paint(c, '#ffd23f', 2.6);
    ellipse(c, 21, 27, 4, 9, 0.35, 'rgba(255,255,255,0.75)');
    poly(c, [47, 12, 49, 17, 54, 19, 49, 21, 47, 26, 45, 21, 40, 19, 45, 17], '#fff6c8', 1.6);
    line(c, 20, 46, 44, 50, 'rgba(201,150,42,0.7)', 2.4);
  } },
  flame: { plate: '', bare: true, draw: (c) => {
    const curve = (): void => { c.beginPath(); c.moveTo(20, 20); c.quadraticCurveTo(50, 22, 53, 56); c.lineCap = 'round'; };
    curve(); c.strokeStyle = INK; c.lineWidth = 19; c.stroke();
    curve(); c.strokeStyle = '#e8412e'; c.lineWidth = 13; c.stroke();
    curve(); c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 3; c.translate(-3, -2); c.stroke(); c.translate(3, 2);
    poly(c, [8, 12, 20, 8, 26, 16, 22, 26, 16, 20], '#4fae3c', 2);
    line(c, 12, 8, 6, 4, INK, 3);
  } },
  infantry: { plate: '#3c6ea8', draw: (c) => {
    poly(c, [14, 14, 50, 14, 50, 34, 32, 54, 14, 34], '#cfd6de');
    poly(c, [32, 14, 50, 14, 50, 34, 32, 54], '#aab4c0', 1.5);
    line(c, 32, 20, 32, 46, GOLD, 4); line(c, 22, 28, 42, 28, GOLD, 4);
  } },
  archer: { plate: '#4c8a3e', draw: (c) => {
    c.beginPath(); c.arc(26, 32, 22, -1.2, 1.2); c.strokeStyle = INK; c.lineWidth = 7; c.stroke();
    c.beginPath(); c.arc(26, 32, 22, -1.2, 1.2); c.strokeStyle = '#d9a566'; c.lineWidth = 3.5; c.stroke();
    line(c, 34, 12, 34, 52, CREAM, 1.5);
    line(c, 14, 32, 52, 32, INK, 3); poly(c, [56, 32, 48, 27, 48, 37], '#e7ecf1', 1.5);
    poly(c, [14, 32, 10, 27, 14, 28.5], CREAM, 1); poly(c, [14, 32, 10, 37, 14, 35.5], CREAM, 1);
  } },
  cavalry: { plate: '#a87a3c', draw: (c) => {
    c.beginPath(); c.arc(32, 32, 17, Math.PI * 0.85, Math.PI * 2.15, true);
    c.lineWidth = 10; c.strokeStyle = INK; c.stroke();
    c.beginPath(); c.arc(32, 32, 17, Math.PI * 0.85, Math.PI * 2.15, true);
    c.lineWidth = 5.5; c.strokeStyle = '#d6dbe2'; c.stroke();
    rect(c, 10, 38, 8, 8, '#d6dbe2', 1.5); rect(c, 46, 38, 8, 8, '#d6dbe2', 1.5);
    for (const x of [14, 50]) circle(c, x, 42, 1.4, INK, 0.5);
  } },
  siege: { plate: '#7a5538', draw: (c) => {
    rect(c, 8, 28, 40, 8, '#b88252', 2);
    poly(c, [46, 24, 56, 32, 46, 40], '#aab4c0', 1.8);
    circle(c, 20, 44, 8, '#cfa070'); circle(c, 20, 44, 2.5, INK, 1);
    circle(c, 40, 44, 8, '#cfa070'); circle(c, 40, 44, 2.5, INK, 1);
    line(c, 14, 28, 20, 18, INK, 3); line(c, 40, 28, 34, 18, INK, 3); line(c, 20, 18, 34, 18, INK, 3);
  } },
  hero: { plate: '#8a3c6e', draw: (c) => {
    poly(c, [12, 44, 10, 22, 22, 32, 32, 14, 42, 32, 54, 22, 52, 44], GOLD);
    rect(c, 12, 44, 40, 8, '#c9962a', 2);
    circle(c, 32, 14, 3, '#e04a4a', 1.5); circle(c, 10, 22, 3, '#e04a4a', 1.5); circle(c, 54, 22, 3, '#e04a4a', 1.5);
  } },
  skull: { plate: '#5a3a3a', draw: (c) => {
    circle(c, 32, 28, 17, CREAM); rect(c, 24, 38, 16, 14, CREAM, 3);
    circle(c, 25, 29, 5, INK, 0.5); circle(c, 39, 29, 5, INK, 0.5);
    poly(c, [32, 34, 29, 40, 35, 40], INK, 1);
    line(c, 28, 45, 28, 51, INK, 1.8); line(c, 32, 45, 32, 51, INK, 1.8); line(c, 36, 45, 36, 51, INK, 1.8);
  } },
  cat_core: { plate: '#b5503c', draw: (c) => {
    poly(c, [10, 30, 32, 10, 54, 30], '#d9704a'); rect(c, 16, 30, 32, 22, CREAM, 2);
    rect(c, 27, 38, 10, 14, '#7a5538', 2); rect(c, 19, 34, 6, 6, '#6c8fb0', 1);
  } },
  cat_economy: { plate: '#c99a2e', draw: (c) => {
    c.beginPath(); c.moveTo(20, 24); c.bezierCurveTo(6, 44, 14, 54, 32, 54); c.bezierCurveTo(50, 54, 58, 44, 44, 24); c.closePath(); paint(c, '#c9a36a');
    rect(c, 22, 14, 20, 10, '#8a6a46', 3);
    circle(c, 32, 40, 8, GOLD, 1.8);
  } },
  cat_military: { plate: '#a83c3c', draw: (c) => { sword(c, 32, 32, 0.8); sword(c, 32, 32, -0.8); } },
  cat_support: { plate: '#4c8a8a', draw: (c) => {
    poly(c, [26, 12, 38, 12, 38, 26, 52, 26, 52, 38, 38, 38, 38, 52, 26, 52, 26, 38, 12, 38, 12, 26, 26, 26], CREAM);
    poly(c, [29, 16, 35, 16, 35, 29, 48, 29, 48, 35, 35, 35, 35, 48, 29, 48, 29, 35, 16, 35, 16, 29, 29, 29], '#d9504a', 1);
  } },
  cat_defence: { plate: '#6a6762', draw: (c) => {
    poly(c, [16, 52, 16, 20, 22, 20, 22, 14, 28, 14, 28, 20, 36, 20, 36, 14, 42, 14, 42, 20, 48, 20, 48, 52], '#cfcac0');
    rect(c, 27, 36, 10, 16, '#573a26', 5); rect(c, 29, 26, 6, 6, INK, 1, 0.5);
  } },
  season_spring: { plate: '#6fae5a', draw: (c) => {
    line(c, 32, 52, 32, 30, INK, 4);
    ellipse(c, 22, 28, 12, 6, -0.6, '#b8e08a'); ellipse(c, 42, 28, 12, 6, 0.6, '#b8e08a');
    circle(c, 32, 16, 5, '#f2a0b8', 1.8);
  } },
  season_summer: { plate: '#e0a030', draw: (c) => {
    for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; line(c, 32 + Math.cos(a) * 17, 32 + Math.sin(a) * 17, 32 + Math.cos(a) * 25, 32 + Math.sin(a) * 25, INK, 4); line(c, 32 + Math.cos(a) * 17, 32 + Math.sin(a) * 17, 32 + Math.cos(a) * 25, 32 + Math.sin(a) * 25, '#fff0a0', 2); }
    circle(c, 32, 32, 14, '#ffe27a');
  } },
  season_autumn: { plate: '#b5622e', draw: (c) => {
    c.beginPath(); c.moveTo(32, 10); c.bezierCurveTo(52, 16, 56, 40, 32, 54); c.bezierCurveTo(8, 40, 12, 16, 32, 10); paint(c, '#e8883a');
    line(c, 32, 14, 32, 56, INK, 2.5); line(c, 32, 30, 42, 24, INK, 1.8); line(c, 32, 38, 22, 32, INK, 1.8);
  } },
  season_winter: { plate: '#5a86b0', draw: (c) => {
    for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; line(c, 32 + Math.cos(a) * 22, 32 + Math.sin(a) * 22, 32 - Math.cos(a) * 22, 32 - Math.sin(a) * 22, INK, 5); }
    for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; line(c, 32 + Math.cos(a) * 22, 32 + Math.sin(a) * 22, 32 - Math.cos(a) * 22, 32 - Math.sin(a) * 22, '#eaf4ff', 2.4); }
    circle(c, 32, 32, 4, '#eaf4ff', 1.5);
  } },
  march_attack: { plate: '#a83c3c', draw: (c) => { sword(c, 32, 32, 0.0); poly(c, [32, 8, 40, 18, 24, 18], CREAM, 1.5); } },
  march_gather: { plate: '#4c8a3e', draw: (c) => {
    line(c, 18, 52, 44, 16, '#7a5538', 4.5);
    c.beginPath(); c.moveTo(34, 14); c.quadraticCurveTo(54, 14, 54, 34); c.lineTo(48, 30); c.quadraticCurveTo(46, 20, 34, 20); c.closePath(); paint(c, '#cfd6de');
  } },
  march_scout: { plate: '#3c6ea8', draw: (c) => {
    c.beginPath(); c.moveTo(8, 32); c.quadraticCurveTo(32, 8, 56, 32); c.quadraticCurveTo(32, 56, 8, 32); paint(c, CREAM);
    circle(c, 32, 32, 9, '#4a7fb8'); circle(c, 32, 32, 4, INK, 0.5);
  } },
  march_return: { plate: '#8a6a46', draw: (c) => {
    poly(c, [10, 32, 28, 14, 28, 25, 52, 25, 52, 39, 28, 39, 28, 50], CREAM);
  } },
  march_reinforce: { plate: '#4c8a8a', draw: (c) => {
    poly(c, [32, 10, 52, 22, 52, 40, 32, 54, 12, 40, 12, 22], '#cfd6de');
    poly(c, [29, 22, 35, 22, 35, 29, 42, 29, 42, 35, 35, 35, 35, 42, 29, 42, 29, 35, 22, 35, 22, 29, 29, 29], '#4c8a3e', 1.5);
  } },
  gift: { plate: '#a8508a', draw: (c) => {
    rect(c, 12, 28, 40, 24, '#e8c0d8', 2); rect(c, 10, 22, 44, 10, '#f3d6e6', 2);
    rect(c, 28, 22, 8, 30, GOLD, 1); 
    c.beginPath(); c.ellipse(24, 16, 8, 5, -0.5, 0, Math.PI * 2); paint(c, GOLD, 2);
    c.beginPath(); c.ellipse(40, 16, 8, 5, 0.5, 0, Math.PI * 2); paint(c, GOLD, 2);
  } },
  research: { plate: '#5a6ab0', draw: (c) => {
    poly(c, [26, 10, 38, 10, 38, 26, 52, 50, 12, 50, 26, 26], '#e0ecf4');
    poly(c, [20, 40, 44, 40, 52, 50, 12, 50], '#6fd0a0', 1.5);
    circle(c, 28, 34, 2.5, CREAM, 1); circle(c, 36, 30, 2, CREAM, 1);
  } },
  quest: { plate: '#8a6a46', draw: (c) => {
    rect(c, 14, 10, 36, 44, CREAM, 4);
    line(c, 20, 22, 44, 22, INK, 2); line(c, 20, 30, 44, 30, INK, 2); line(c, 20, 38, 36, 38, INK, 2);
    circle(c, 44, 46, 7, '#d9504a', 1.8); line(c, 44, 42, 44, 47, CREAM, 2.2); line(c, 44, 49.5, 44, 50, CREAM, 2.2);
  } },
  builder: { plate: '#7a5538', draw: (c) => {
    line(c, 18, 50, 42, 24, '#b88252', 6);
    poly(c, [34, 14, 54, 14, 54, 24, 42, 24, 34, 20], '#cfd6de', 2);
  } },
  pop: { plate: '', bare: true, draw: (c) => {
    poly(c, [18, 34, 6, 14, 16, 22, 14, 6, 26, 20], '#f4f0e6');
    ellipse(c, 30, 38, 20, 16, 0, '#fffaf0');
    ellipse(c, 27, 40, 10, 7, 0.4, '#ece4d2');
    circle(c, 46, 22, 11, '#fffaf0');
    circle(c, 42, 10, 4, '#e8412e', 1.6); circle(c, 47, 8, 4.2, '#e8412e', 1.6); circle(c, 52, 11, 3.6, '#e8412e', 1.6);
    poly(c, [55, 20, 63, 24, 55, 28], '#ff9a3c', 1.8);
    poly(c, [52, 28, 55, 36, 49, 31], '#e8412e', 1.4);
    circle(c, 49, 20, 2.2, INK, 0.5);
    line(c, 26, 52, 26, 60, '#ff9a3c', 3.4); line(c, 36, 52, 36, 60, '#ff9a3c', 3.4);
    line(c, 21, 61, 31, 61, '#ff9a3c', 3); line(c, 31, 61, 41, 61, '#ff9a3c', 3);
  } },
  queue: { plate: '', bare: true, draw: (c) => {
    rect(c, 8, 8, 40, 14, '#f0cf86', 5); rect(c, 14, 25, 40, 14, '#e8b866', 5); rect(c, 8, 42, 40, 14, '#d9a252', 5);
    for (const y of [15, 32, 49]) { circle(c, 17, y, 2.6, INK, 0.5); line(c, 24, y, 40, y, INK, 2.4); }
    line(c, 40, 56, 58, 38, INK, 7); line(c, 40, 56, 58, 38, '#b88252', 3.6);
    poly(c, [50, 30, 62, 30, 62, 42, 56, 42, 50, 38], '#cfd6de', 2);
  } },
  clock: { plate: '#6a6762', draw: (c) => {
    circle(c, 32, 32, 20, CREAM); line(c, 32, 32, 32, 18, INK, 3.5); line(c, 32, 32, 42, 36, INK, 3.5); circle(c, 32, 32, 2.5, INK, 0.5);
  } },
};

const ALIAS: Record<string, string> = {
  food: 'wheat', wood: 'log', stone: 'rock', gold: 'coin', ember: 'flame',
  res_food: 'wheat', res_wood: 'log', res_stone: 'rock', res_gold: 'coin', res_ember: 'flame',
  core: 'cat_core', economy: 'cat_economy', military: 'cat_military', support: 'cat_support', defence: 'cat_defence',
  spring: 'season_spring', summer: 'season_summer', autumn: 'season_autumn', winter: 'season_winter',
};

export const ICON_IDS: string[] = [...Object.keys(recipes), ...Object.keys(ALIAS)];

const canvasCache = new Map<string, HTMLCanvasElement>();
const urlCache = new Map<string, string>();

function hasDom(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

/** Cached icon canvas (shared; do not mutate), or null without a DOM or for an unknown id. */
export function getIconCanvas(id: string, size = 32): HTMLCanvasElement | null {
  if (!hasDom()) return null;
  const key = `${ALIAS[id] ?? id}@${size}`;
  const hit = canvasCache.get(key);
  if (hit) return hit;
  const r = recipes[ALIAS[id] ?? id];
  if (!r) return null;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d');
  if (!c) return null;
  c.scale(size / 64, size / 64);
  if (r.bare) {
    // free-standing sprite: soft drop shadow, no plate
    c.save();
    c.shadowColor = 'rgba(40,28,18,0.35)'; c.shadowOffsetY = 2; c.shadowBlur = 2;
    r.draw(c);
    c.restore();
  } else {
  // plate: rim, body, highlight
  c.beginPath(); c.arc(32, 32, 30.5, 0, Math.PI * 2); c.fillStyle = INK; c.fill();
  c.beginPath(); c.arc(32, 32, 28, 0, Math.PI * 2); c.fillStyle = r.plate; c.fill();
  c.beginPath(); c.arc(32, 32, 28, Math.PI * 1.05, Math.PI * 1.75); c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.28)'; c.stroke();
  c.save();
  c.beginPath(); c.arc(32, 32, 27, 0, Math.PI * 2); c.clip();
  r.draw(c);
  c.restore();
  }
  canvasCache.set(key, cv);
  return cv;
}

/** Data URL for an icon id (resource, troop class, category, season, skull, hero, march kind, gift, research, quest...). */
export function getIcon(id: string, size = 32): string {
  const key = `${id}@${size}`;
  const hit = urlCache.get(key);
  if (hit !== undefined) return hit;
  const cv = getIconCanvas(id, size);
  const url = cv ? cv.toDataURL('image/png') : '';
  if (cv) urlCache.set(key, url);
  return url;
}
