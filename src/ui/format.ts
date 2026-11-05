// Number / time / effect formatting shared by components.
import { TICKS_PER_SECOND } from '@sim/constants';
import { BUILDINGS, effectsAt } from '@sim/data/registry';
import type { BuildingEffectData } from '@sim/data/schema';
import type { Res, ResourceId } from '@sim/state';
import { S } from './strings';

export const RES_ORDER: ResourceId[] = ['food', 'wood', 'stone', 'gold', 'ember'];

export function fmtNum(n: number): string {
  const v = Math.round(n);
  if (Math.abs(v) >= 100000) return `${(v / 1000).toFixed(0)}k`;
  if (Math.abs(v) >= 10000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}

export function fmtRate(perMin: number): string {
  const r = Math.round(perMin * 10) / 10;
  return `${r >= 0 ? '+' : ''}${Number.isInteger(r) ? r : r.toFixed(1)}`;
}

/** Ticks -> "1h 05m", "3m 20s", "45s". */
export function fmtTicks(ticks: number): string {
  const secs = Math.max(0, Math.ceil(ticks / TICKS_PER_SECOND));
  if (secs >= 3600) return `${Math.floor(secs / 3600)}${S.common.hour} ${String(Math.floor((secs % 3600) / 60)).padStart(2, '0')}${S.common.min}`;
  if (secs >= 60) return `${Math.floor(secs / 60)}${S.common.min} ${String(secs % 60).padStart(2, '0')}${S.common.sec}`;
  return `${secs}${S.common.sec}`;
}

export function fmtMs(ms: number): string { return fmtTicks((ms / 1000) * TICKS_PER_SECOND); }

export function costEntries(c: Res): [ResourceId, number][] {
  return RES_ORDER.filter((r) => (c[r] ?? 0) > 0).map((r) => [r, c[r] ?? 0]);
}

export interface EffectRow { key: string; label: string; value: number; suffix: string }

function row(key: string, label: string, value: number, suffix = ''): EffectRow { return { key, label, value, suffix }; }

/** Flat list of numeric effect rows for a building at a level (used for current/next diffs and build cards). */
export function effectRows(type: string, level: number): EffectRow[] {
  const def = BUILDINGS[type];
  if (!def) return [];
  const out: EffectRow[] = [];
  const kinds = new Set(def.effects.map((e) => e.kind));
  for (const kind of kinds) {
    for (const e of effectsAt(type, kind as BuildingEffectData['kind'], Math.max(1, level))) {
      const x = e as unknown as Record<string, number | string>;
      switch (kind) {
        case 'produce': out.push(row(`produce_${x.res}`, `${S.resources[x.res as string]} ${S.effects.produce}`, x.perMinute as number, S.effects.perMinute)); break;
        case 'cap': out.push(row(`cap_${x.res}`, `${x.res === 'all' ? 'Food, wood, stone, gold' : S.resources[x.res as string]} ${S.effects.cap}`, x.amount as number)); break;
        case 'builders': out.push(row('builders', S.effects.builders, x.count as number)); break;
        case 'marchSlots': out.push(row('marchSlots', S.effects.marchSlots, x.count as number)); break;
        case 'trainSpeed': out.push(row(`train_${x.troopClass}`, `${S.classes[x.troopClass as string]} ${S.effects.trainSpeed}`, Math.round((x.mult as number) * 100), '%')); break;
        case 'heal': out.push(row('heal', S.effects.heal, x.perMinute as number, S.effects.perMinute)); break;
        case 'woundedCap': out.push(row('woundedCap', S.effects.woundedCap, x.amount as number)); break;
        case 'researchSlots': out.push(row('researchSlots', S.effects.researchSlots, x.count as number)); break;
        case 'heroCandidates': out.push(row('heroCandidates', S.effects.heroCandidates, x.count as number)); break;
        case 'vision': out.push(row('vision', S.effects.vision, x.radius as number)); break;
        case 'territory': out.push(row('territory', S.effects.territory, x.radius as number)); break;
        case 'defence': out.push(row('defHp', S.effects.defenceHp, x.hp as number)); out.push(row('defAtk', S.effects.defenceAtk, x.atk as number)); break;
        case 'tradeLimit': out.push(row('tradeLimit', S.effects.tradeLimit, x.amount as number)); break;
        case 'traderCap': out.push(row('traderCap', S.effects.traderCap, x.count as number)); break;
        case 'popCap': out.push(row('popCap', S.effects.popCap, x.amount as number)); break;
        default: break;
      }
    }
  }
  return out;
}
