import type { Command } from '@sim/commands';
import { BUILDING_LIST, HERO_LIST, LORD_LIST, RESEARCH_LIST, TROOP_LIST } from '@sim/data/registry';
import type { GameEvent } from '@sim/events';
import { hash32 } from '@sim/rng';
import { hashState } from '@sim/save/hash';
import type { GameState, ResourceId } from '@sim/state';
import { advance } from '@sim/tick';

export interface ScriptEntry { tick: number; cmd: Command }

/**
 * Deterministic pseudo-random command log covering every command type. Uses hash32 only (no state RNG),
 * so as systems get implemented the same script automatically exercises them (rejections are fine).
 */
export function fuzzScript(seed: number, ticks: number, every = 25): ScriptEntry[] {
  const out: ScriptEntry[] = [];
  const R = ['food', 'wood', 'stone', 'gold', 'ember'] as ResourceId[];
  const pick = <T>(xs: readonly T[], k: string, t: number): T => xs[hash32(seed, k, t) % xs.length] as T;
  for (let t = 1; t < ticks; t += every + (hash32(seed, 'gap', t) % 10)) {
    const kind = hash32(seed, 'kind', t) % 21;
    const b = String(1 + (hash32(seed, 'inst', t) % 12));
    const cmds: Command[] = [
      { t: 'build', building: pick(BUILDING_LIST, 'b', t).id, cell: hash32(seed, 'cell', t) % 817 },
      { t: 'upgrade', building: b }, { t: 'cancelBuild', building: b }, { t: 'demolish', building: b }, { t: 'repair', building: b },
      { t: 'train', troop: pick(TROOP_LIST, 'tr', t).id, count: 1 + (hash32(seed, 'n', t) % 30) },
      { t: 'cancelTrain', job: b },
      { t: 'research', tech: pick(RESEARCH_LIST, 'rs', t).id },
      { t: 'march', hero: 'aldric', troops: { militia: 10 }, target: { cell: hash32(seed, 'tc', t) % 1261 }, kind: pick(['gather', 'attack', 'scout'] as const, 'mk', t) },
      { t: 'recall', march: b },
      { t: 'heroTalent', hero: 'aldric', talent: 'w_vigor' },
      { t: 'equip', hero: 'aldric', slot: 'weapon', item: null },
      { t: 'recruitHero', hero: pick(HERO_LIST, 'h', t).id },
      { t: 'respec', hero: 'aldric' },
      { t: 'allyRequest', lord: pick(LORD_LIST, 'l', t).id, choice: 'accept' },
      { t: 'allyGift', lord: pick(LORD_LIST, 'l', t).id, gift: { wood: 50 } },
      { t: 'allyTrade', lord: pick(LORD_LIST, 'l', t).id, give: pick(R, 'g', t), get: pick(R, 'x', t) },
      { t: 'startRally', hero: 'aldric', troops: { militia: 10 }, target: b },
      { t: 'eventChoice', option: hash32(seed, 'o', t) % 2 },
      { t: 'marketTrade', give: pick(R, 'g2', t), get: pick(R, 'x2', t), amount: 100 },
      { t: 'setSpeed', speed: pick([0, 1, 2, 4] as const, 'sp', t) },
    ];
    out.push({ tick: t, cmd: cmds[kind] as Command });
  }
  return out;
}

export interface RunResult { events: GameEvent[]; hash: number; checkpoints: number[] }

/** Runs `ticks` ticks from state.tick, feeding script entries whose tick matches state.tick. */
export function runScript(state: GameState, script: readonly ScriptEntry[], ticks: number, checkEvery = 0): RunResult {
  const byTick = new Map<number, Command[]>();
  for (const e of script) { const a = byTick.get(e.tick) ?? []; a.push(e.cmd); byTick.set(e.tick, a); }
  const events: GameEvent[] = [];
  const checkpoints: number[] = [];
  for (let i = 0; i < ticks; i++) {
    events.push(...advance(state, byTick.get(state.tick) ?? []));
    if (checkEvery && state.tick % checkEvery === 0) checkpoints.push(hashState(state));
  }
  return { events, hash: hashState(state), checkpoints };
}
