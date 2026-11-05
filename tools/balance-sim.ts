// Balance bots (M3, M5, M7, M10). They play with public commands only, through advance(), on a real generated map
// (seed 1337, small, Normal). `runOpening` (TH3 pacing), `runFirstCamp` (basic army clears a tier-1 camp),
// `runYear` (80 game days) and `runPlaythrough` (TH5, first boss, Reign progress) are imported by tests/sim/balance*.test.ts.
// Usage: `npm run balance [opening|camp|year|play|all]`. The older single-purpose script is `runScriptedOpening`.
import { fileURLToPath } from 'node:url';
import { baseGrid, cellDistance } from '../src/sim/city/grid';
import { adjacencyBonus } from '../src/sim/city/adjacency';
import { cellError, countOfType, townHallLevel } from '../src/sim/city/territory';
import { validateCommand } from '../src/sim/commands';
import type { Command } from '../src/sim/commands';
import { DAY_TICKS, TICKS_PER_MINUTE, YEAR_DAYS } from '../src/sim/constants';
import { buildingCost } from '../src/sim/data/registry';
import { createInitialState } from '../src/sim/init';
import type { GameState } from '../src/sim/state';
import { advance } from '../src/sim/tick';
import { reignProgress } from '../src/sim/progression/win';
import { playBot } from './bot/run';
import type { Milestones } from './bot/run';
import { makeTestBaseTerrain, makeTestWorldLogic } from '../src/sim/worldgen/testLogic';

export const TH3_MIN_MINUTES = 8;
export const TH3_MAX_MINUTES = 12;

export interface OpeningResult { th2Minutes: number | null; th3Minutes: number | null; ticks: number; log: string[]; state: GameState }

/** Best free cell for a building type: highest adjacency bonus, then nearest the town hall, then lowest index. */
function bestCell(state: GameState, type: string): number | null {
  const th = state.city.buildings[state.city.townHall];
  if (!th) return null;
  const g = baseGrid(state.city.radius);
  let best = -1;
  let bestScore = -Infinity;
  for (let c = 0; c < g.count; c++) {
    if (cellError(state, c)) continue;
    const d = cellDistance(state.city.radius, th.cell, c);
    if (d < 2) continue; // keep the ring around the hall free
    const score = adjacencyBonus(state, type, c) * 10 - d;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best < 0 ? null : best;
}

/** Build order (type, how many in total before moving on). The bot also upgrades the Town Hall as soon as it can. */
const PLAN: readonly [string, number, boolean][] = [
  ['farm', 1, false], ['lumber_camp', 1, false], ['quarry', 1, false], ['lumber_camp', 2, false], ['farm', 2, false],
  ['house', 1, true], ['storehouse', 1, true], // optional: only if the next Town Hall level stays affordable
];

function decide(state: GameState, targetTH: number): Command[] {
  const out: Command[] = [];
  const th = state.city.buildings[state.city.townHall];
  if (!th) return out;
  const thBusy = state.city.queue.some((j) => j.building === th.id);
  if (!thBusy && th.level < targetTH) {
    const up: Command = { t: 'upgrade', building: th.id };
    if (!validateCommand(state, up)) return [up];
  }
  const thCost = buildingCost('town_hall', th.level + 1);
  for (const [type, n, optional] of PLAN) {
    if (countOfType(state, type) >= n) continue;
    const cell = bestCell(state, type);
    if (cell === null) continue;
    const cmd: Command = { t: 'build', building: type, cell };
    if (validateCommand(state, cmd)) {
      if (optional) continue;
      break; // wait for resources instead of skipping ahead
    }
    if (optional) {
      const c = buildingCost(type, 1);
      const keeps = (['wood', 'stone', 'gold'] as const).every((k) => state.resources[k] - (c[k] ?? 0) >= (thCost[k] ?? 0));
      if (!keeps) continue;
    }
    return [cmd];
  }
  return out;
}

/** Plays the scripted opening until Town Hall 3 (or `maxMinutes`). Deterministic. */
export function runScriptedOpening(opts: { seed?: number; maxMinutes?: number; targetTH?: number } = {}): OpeningResult {
  const seed = opts.seed ?? 1337;
  const state = createInitialState(seed, { difficulty: 'normal' }, {
    worldLogic: makeTestWorldLogic(20), baseTerrain: makeTestBaseTerrain(16, seed),
  });
  const target = opts.targetTH ?? 3;
  const maxTicks = (opts.maxMinutes ?? 30) * TICKS_PER_MINUTE;
  const log: string[] = [];
  let th2: number | null = null;
  let th3: number | null = null;
  while (state.tick < maxTicks && th3 === null) {
    const cmds = state.tick % 10 === 0 ? decide(state, target) : [];
    for (const e of advance(state, cmds)) {
      if (e.t === 'BuildingCompleted') log.push(`${(e.tick / TICKS_PER_MINUTE).toFixed(2)}m ${e.type} L${e.level}`);
    }
    const lvl = townHallLevel(state);
    if (lvl >= 2 && th2 === null) th2 = state.tick / TICKS_PER_MINUTE;
    if (lvl >= 3 && th3 === null) th3 = state.tick / TICKS_PER_MINUTE;
  }
  void DAY_TICKS;
  return { th2Minutes: th2, th3Minutes: th3, ticks: state.tick, log, state };
}


export interface ScenarioReport { name: string; ok: boolean; notes: string[]; m: Milestones }

const f1 = (v: number | null): string => (v === null ? 'never' : `${v.toFixed(1)} min`);
export const BOT_DEFAULTS = { seed: Number(process.env.BOT_SEED ?? 1337) };

/** M3: Town Hall 2 and 3 pacing with the general bot, economy only. Target 8 to 12 minutes. */
export function runOpening(opts: { seed?: number } = {}): { th2Minutes: number | null; th3Minutes: number | null; m: Milestones } {
  const { m } = playBot({ seed: opts.seed ?? BOT_DEFAULTS.seed, bot: { targetTH: 3, attack: false }, maxMinutes: 20, until: (s) => (s.city.buildings[s.city.townHall]?.level ?? 1) >= 3 });
  return { th2Minutes: m.th[2] ?? null, th3Minutes: m.th[3] ?? null, m };
}

/** M5: Town Hall 3 with a basic army (barracks troops) clears a tier-1 camp with real march + combat. */
export function runFirstCamp(opts: { seed?: number } = {}): ScenarioReport {
  const { m } = playBot({ seed: opts.seed ?? BOT_DEFAULTS.seed, bot: { targetTH: 3 }, maxMinutes: 40, until: (_s, mm) => mm.firstCampMinutes !== null });
  const ok = m.th[3] !== undefined && m.firstCampMinutes !== null;
  return { name: 'first camp (M5)', ok, m, notes: [`TH3 at ${f1(m.th[3] ?? null)}`, `first tier-1 camp cleared at ${f1(m.firstCampMinutes)}`, `army ${m.troops}, heroes ${m.heroes}`] };
}

/** M7: one full year (80 game days) at Normal. Raids come; the town must keep functioning. */
export function runYear(opts: { seed?: number; targetTH?: number } = {}): ScenarioReport {
  const { state, m } = playBot({ seed: opts.seed ?? BOT_DEFAULTS.seed, bot: { targetTH: opts.targetTH ?? 6, maxArmy: 120 }, maxMinutes: YEAR_DAYS * DAY_TICKS / TICKS_PER_MINUTE });
  const notes = [
    `reached TH${Math.max(...Object.keys(m.th).map(Number), 1)} (TH5 at ${f1(m.th[5] ?? null)})`,
    `camps cleared ${m.campsCleared}, raids repelled ${m.raidsWon}, raids lost ${m.raidsLost}, attacks failed ${m.battlesLost}`,
    `longest zero-food stretch ${m.maxZeroFoodDays.toFixed(2)} days, min food ${m.minFood}`,
    `end stock ${JSON.stringify(state.resources)}`,
  ];
  const ok = state.tick >= YEAR_DAYS * DAY_TICKS && m.maxZeroFoodDays <= 5 && m.campsCleared >= 3 && m.raidsLost <= Math.max(3, m.raidsWon + 2);
  return { name: 'year (M7)', ok, m, notes };
}

/** M10: longer scripted playthrough: TH5, first boss (tier 2), progress towards Reign. */
export function runPlaythrough(opts: { seed?: number; maxMinutes?: number } = {}): ScenarioReport {
  const { state, m } = playBot({
    seed: opts.seed ?? BOT_DEFAULTS.seed, bot: { targetTH: 10, maxArmy: 400, maxLoss: 0.5 }, maxMinutes: opts.maxMinutes ?? 150,
    until: (_s, mm) => mm.firstBossMinutes !== null && mm.th[5] !== undefined,
  });
  const rp = reignProgress(state);
  m.reignPct = Math.round(100 * (0.5 * Math.min(1, rp.thLevel / rp.thNeeded) + (rp.bossDefeated ? 0.5 : 0)));
  const notes = [
    `TH5 at ${f1(m.th[5] ?? null)} (target 30 to 45)`, `first region boss at ${f1(m.firstBossMinutes)} (target 45 to 70)`,
    `TH reached ${rp.thLevel}/${rp.thNeeded}, final boss tier ${rp.bossTier} ${rp.bossDefeated ? 'defeated' : 'not defeated'}; Reign progress ${m.reignPct}%`,
    `camps cleared ${m.campsCleared}, raids won ${m.raidsWon}/lost ${m.raidsLost}, heroes ${m.heroes}`,
  ];
  return { name: 'playthrough (M10)', ok: m.th[5] !== undefined, m, notes };
}

function print(r: ScenarioReport): void {
  console.log(`\n== ${r.name}: ${r.ok ? 'OK' : 'FAIL'} (${r.m.ticks} ticks in ${(r.m.wallMs / 1000).toFixed(1)} s = ${Math.round(r.m.ticks / Math.max(0.001, r.m.wallMs / 1000))} ticks/s)`);
  for (const n of r.notes) console.log('  ' + n);
  if (process.env.BOT_LOG) for (const l of r.m.log) console.log('    ' + l);
}

function main(): void {
  const which = process.argv[2] ?? 'all';
  let bad = false;
  if (which === 'opening' || which === 'all') {
    const o = runOpening();
    const ok = o.th3Minutes !== null && o.th3Minutes >= TH3_MIN_MINUTES && o.th3Minutes <= TH3_MAX_MINUTES;
    print({ name: 'opening (M3)', ok, m: o.m, notes: [`TH2 at ${f1(o.th2Minutes)}, TH3 at ${f1(o.th3Minutes)} (target ${TH3_MIN_MINUTES} to ${TH3_MAX_MINUTES})`] });
    bad ||= !ok;
  }
  for (const [name, fn] of [['camp', runFirstCamp], ['year', runYear], ['play', runPlaythrough]] as const) {
    if (which !== name && which !== 'all') continue;
    const r = fn();
    print(r);
    bad ||= !r.ok;
  }
  if (bad) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
