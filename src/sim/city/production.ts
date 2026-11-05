// Production and upkeep maths shared by the economy tick and the HUD rate tooltips.
import { BALANCE, BUILDINGS, TROOPS, effectsAt } from '../data/registry';
import { FP, TICKS_PER_MINUTE } from '../constants';
import type { GameState, ResourceId } from '../state';
import { sortedKeys } from '../util';
import { adjacencyBonus } from './adjacency';
import { proximityBonus } from './proximity';
import { RES_KEYS } from './cost';
import { buffProdPct, clanProdPct, researchProdPct, seasonProdMult, upkeepPct } from './modifiers';
import { seasonMods } from '../systems/seasons';

/** Per-minute contributions that sum to `gross` for one resource. */
export interface RateParts { base: number; adjacency: number; proximity: number; research: number; clan: number; buffs: number; season: number; damaged: number; floor: number }
export interface RateInfo { gross: number; upkeep: number; net: number; parts: RateParts }

const zeroParts = (): RateParts => ({ base: 0, adjacency: 0, proximity: 0, research: 0, clan: 0, buffs: 0, season: 0, damaged: 0, floor: 0 });

export interface Production { perMinute: Record<ResourceId, number>; parts: Record<ResourceId, RateParts>; byBuilding: Record<string, { res: ResourceId; perMinute: number }[]> }

/**
 * Fixed-point (x1000) amount to credit on `tick` for a rate in units per minute. Uses floor differences over the
 * 600-tick phase so a constant rate sums to exactly floor(rate * 1000) per minute with no rounding bias.
 */
export function fpForTick(perMinute: number, tick: number): number {
  const p = tick % TICKS_PER_MINUTE;
  const k = (perMinute * FP) / TICKS_PER_MINUTE;
  return Math.floor(k * (p + 1)) - Math.floor(k * p);
}

export function computeProduction(state: GameState): Production {
  const perMinute = { food: 0, wood: 0, stone: 0, gold: 0, ember: 0 } as Record<ResourceId, number>;
  const parts = {} as Record<ResourceId, RateParts>;
  const byBuilding: Production['byBuilding'] = {};
  for (const r of RES_KEYS) parts[r] = zeroParts();
  // research / clan / buff / season factors depend only on the resource: compute each once per call (same values, same maths)
  const resMods = {} as Partial<Record<ResourceId, { rs: number; cl: number; bf: number; se: number }>>;
  const modsOf = (res: ResourceId): { rs: number; cl: number; bf: number; se: number } =>
    (resMods[res] ??= { rs: researchProdPct(state, res) / 100, cl: clanProdPct(state, res) / 100, bf: buffProdPct(state, res) / 100, se: seasonProdMult(state, res) });
  for (const id of sortedKeys(state.city.buildings)) {
    const b = state.city.buildings[id];
    if (!b || b.level < 1 || !BUILDINGS[b.type]) continue;
    for (const e of effectsAt(b.type, 'produce', b.level)) {
      const base = e.perMinute;
      const adj = adjacencyBonus(state, b.type, b.cell) / 100;
      const px = proximityBonus(state, b.type, b.cell) / 100;
      const { rs, cl, bf, se } = modsOf(e.res);
      const sum = 1 + adj + px + rs + cl + bf;
      const dm = b.damaged ? 0.5 : 1;
      const raw = sum * se * dm;
      const mult = Math.max(raw, BALANCE.productionFloor);
      perMinute[e.res] += base * mult;
      (byBuilding[id] ??= []).push({ res: e.res, perMinute: base * mult });
      const p = parts[e.res];
      p.base += base;
      p.adjacency += base * adj;
      p.proximity += base * px;
      p.research += base * rs;
      p.clan += base * cl;
      p.buffs += base * bf;
      p.season += base * sum * (se - 1);
      p.damaged += base * sum * se * (dm - 1);
      p.floor += base * (mult - raw);
    }
  }
  return { perMinute, parts, byBuilding };
}

/** Food upkeep per minute: healthy full, wounded half, marching troops full (eaten from city stock). */
export function upkeepPerMinute(state: GameState): number {
  let t = 0;
  for (const id of sortedKeys(state.troops)) {
    const p = state.troops[id];
    const rate = TROOPS[id]?.upkeepFoodPerMinute ?? 0;
    if (p) t += (p.healthy + p.wounded * 0.5) * rate;
  }
  for (const mid of sortedKeys(state.marches)) {
    const m = state.marches[mid];
    if (!m) continue;
    for (const tid of sortedKeys(m.troops)) t += (m.troops[tid] ?? 0) * (TROOPS[tid]?.upkeepFoodPerMinute ?? 0);
  }
  const mult = seasonMods(state).upkeep * (1 + upkeepPct(state) / 100) * BALANCE.upkeepMult;
  return t * mult;
}

/** Per-minute gross/upkeep/net and the breakdown parts for each resource (HUD tooltips). */
export function getRates(state: GameState): Record<ResourceId, RateInfo> {
  const prod = computeProduction(state);
  const out = {} as Record<ResourceId, RateInfo>;
  for (const r of RES_KEYS) {
    const gross = prod.perMinute[r];
    const upkeep = r === 'food' ? upkeepPerMinute(state) : 0;
    out[r] = { gross, upkeep, net: gross - upkeep, parts: prod.parts[r] };
  }
  return out;
}
