// Temporary dev harness for the render scenes (tools/scenes.html). Not used by the game.
import { GameClient } from '../../app/game';
import { generateBaseTerrain } from '../../gen/base/layout';
import { generateTerrainLogic, toPlainLogic } from '../../gen/terrain/logic';
import type { GameState, WorldLogicInput } from '../../sim/state';
import { createRenderer } from '../engine';

const q = new URLSearchParams(location.search);
const seed = Number(q.get('seed') ?? 1337) >>> 0;
const radius = Number(q.get('radius') ?? 40);
const logic = generateTerrainLogic(seed, { radius });
const p = toPlainLogic(logic);
// capital: walkable cell of the biggest region nearest the island centre
const big = [...p.regions].sort((a, b) => b.cells - a.cells)[0]!;
let cap = -1;
let bd = 1e9;
for (let i = 0; i < p.regionOf.length; i++) {
  if (p.regionOf[i] !== big.id || !(p.flags[i]! & 4) || (p.flags[i]! & (8 | 16 | 32))) continue;
  const d = Math.hypot(logic.grid.x[i]!, logic.grid.z[i]!);
  if (d < bd) { bd = d; cap = i; }
}
const worldLogic = { ...p, capitalCell: cap } as unknown as WorldLogicInput;
const client = GameClient.create(seed, {}, { worldLogic, baseTerrain: generateBaseTerrain(seed, 16) });
const st = client.getState() as GameState;
st.season.index = (['spring', 'summer', 'autumn', 'winter'].indexOf(q.get('season') ?? 'summer') as 0 | 1 | 2 | 3) || 0;
if (q.get('season') === null) st.season.index = 1;
for (const r of Object.keys(st.resources)) (st.resources as Record<string, number>)[r] = 99999;
for (const t of Object.keys(st.troops)) st.troops[t]!.healthy = 200;

// a few buildings around the town hall
const th = st.city.buildings[st.city.townHall]!;
const R = st.city.radius;
const plan = ['house', 'farm', 'farm', 'lumber_camp', 'storehouse', 'house', 'house', 'barracks', 'tavern', 'quarry', 'archery_range', 'wall', 'wall'];
const g = logic.grid; void g;
import('../../sim/city/grid').then(({ baseGrid, cellDistance }) => {
  const bg = baseGrid(R);
  const spots: number[] = [];
  for (let c = 0; c < bg.count; c++) {
    const d = cellDistance(R, th.cell, c);
    if (d >= 1 && d <= 4 && st.city.terrain[c] === 0) spots.push(c);
  }
  spots.sort((a, b) => cellDistance(R, th.cell, a) - cellDistance(R, th.cell, b) || a - b);
  let si = 0;
  for (const type of plan) {
    for (let tries = 0; tries < 20 && si < spots.length; tries++) {
      const c = spots[si++]!;
      if (!client.dispatch({ t: 'build', building: type, cell: c })) { client.advanceTicks(500); break; }
    }
  }
  client.advanceTicks(Number(q.get('ticks') ?? 3000));
  const nodes = Object.values(st.world.nodes);
  const hero = Object.keys(st.heroes)[0];
  if (hero && nodes.length && q.get('march') !== '0') {
    const n = nodes.sort((a, b) => Math.hypot(logic.grid.x[a.cell]! - logic.grid.x[cap]!, logic.grid.z[a.cell]! - logic.grid.z[cap]!) - Math.hypot(logic.grid.x[b.cell]! - logic.grid.x[cap]!, logic.grid.z[b.cell]! - logic.grid.z[cap]!))[0]!;
    const err = client.dispatch({ t: 'march', hero, troops: { militia: 20 }, target: { node: n.id }, kind: 'gather' });
    console.log('march', err);
    client.advanceTicks(60);
  }
});

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = createRenderer(canvas, client);
client.setScene(q.get('scene') === 'world' ? 'world' : 'base');
let last = performance.now();
function loop(now: number): void {
  const dt = now - last;
  last = now;
  client.frame(dt);
  renderer.frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
(window as unknown as Record<string, unknown>)['__dev'] = { client, renderer, state: st, cap, logic };
