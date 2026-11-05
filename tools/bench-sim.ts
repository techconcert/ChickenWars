// Sim tick benchmark at an endgame-like state: 100 marches, 40 camps, many buildings and troops. Budget: < 2 ms per tick.
// Usage: `npx tsx tools/bench-sim.ts`.
import { TICKS_PER_MINUTE } from '../src/sim/constants';
import { advance } from '../src/sim/tick';
import { TROOP_LIST } from '../src/sim/data/registry';
import type { GameState, MarchState } from '../src/sim/state';
import { realState } from './bot/world';

export function endgameState(): GameState {
  const s = realState({ radius: 60 });
  const th = s.city.buildings[s.city.townHall]!;
  th.level = 10;
  for (const r of s.world.regions) r.unlocked = true;
  for (let c = 0; c < s.world.fog.length; c++) s.world.fog[c] = 1;
  let n = 0;
  for (const t of ['farm', 'lumber_camp', 'quarry', 'mine', 'house', 'storehouse', 'barracks', 'archery_range', 'stable', 'watchtower', 'wall', 'academy', 'infirmary']) {
    for (let i = 0; i < 5; i++) {
      const id = String(s.nextId++);
      s.city.buildings[id] = { id, type: t, cell: 3 + n++, level: 8, damaged: false };
    }
  }
  for (const t of TROOP_LIST) s.troops[t.id] = { healthy: 400, wounded: 20 };
  for (const k of ['food', 'wood', 'stone', 'gold'] as const) s.resources[k] = 50000;
  // 40 camps (generated ones are kept; top up with active hostile pois) and 100 marches walking out and back
  const camps = Object.values(s.world.pois).filter((p) => p.kind === 'bandit_camp');
  for (const c of camps) c.active = true;
  const nodes = Object.values(s.world.nodes);
  const heroIds = Object.keys(s.heroes);
  for (let i = 0; i < 100; i++) {
    const node = nodes[i % nodes.length]!;
    const hid = `bench_hero_${i}`;
    s.heroes[hid] = { ...s.heroes[heroIds[0]!]!, id: hid, march: String(1000 + i) };
    const m: MarchState = {
      id: String(1000 + i), hero: hid, troops: { militia: 20 }, kind: 'garrison', target: { cell: node.cell },
      path: [s.world.capitalCell, node.cell], step: 0, progress: 0, state: 'done', carried: {}, supply: 0, startedAt: 0,
    };
    s.marches[m.id] = m;
  }
  return s;
}

function main(): void {
  const s = endgameState();
  for (let i = 0; i < 300; i++) advance(s, []); // warm up
  const N = 3000;
  const t0 = process.hrtime.bigint();
  let worst = 0;
  for (let i = 0; i < N; i++) {
    const a = process.hrtime.bigint();
    advance(s, []);
    const d = Number(process.hrtime.bigint() - a) / 1e6;
    if (d > worst) worst = d;
  }
  const avg = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  const camps = Object.values(s.world.pois).filter((p) => p.kind === 'bandit_camp').length;
  console.log(`endgame bench: ${Object.keys(s.marches).length} marches, ${camps} camps, ${Object.keys(s.city.buildings).length} buildings`);
  console.log(`avg ${avg.toFixed(3)} ms/tick, worst ${worst.toFixed(2)} ms over ${N} ticks (budget 2 ms) = ${Math.round(1000 / avg)} ticks/s; 1 minute = ${TICKS_PER_MINUTE} ticks`);
  if (avg > 2) process.exit(1);
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
