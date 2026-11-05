// Combat-facing modifiers of a hero: talents + clan + capped research. Pure; combat reads these.
import { CLANS, TALENTS, TROOPS } from '../data/registry';
import type { EffectData } from '../data/schema';
import { researchEffects, capFor } from '../research/bonus';
import type { GameState, Stack } from '../state';
import { sortedKeys } from '../util';
import { skillRankOf } from './talents';

type Cls = 'infantry' | 'archer' | 'cavalry' | 'siege';
const CLASSES: readonly Cls[] = ['infantry', 'archer', 'cavalry', 'siege'];

export interface HeroCombatMods {
  /** per-class permille bonuses to troop attack / defence / hp */
  classAtkPm: Record<Cls, number>; classDefPm: Record<Cls, number>; classHpPm: Record<Cls, number>;
  /** percent added to the wounded share (talents only; research/clan are in military.woundedShare) */
  woundedRatioPct: number;
  /** percent more rage per round */
  rageGainPct: number;
  skillRank: number;
}

const zero = (): Record<Cls, number> => ({ infantry: 0, archer: 0, cavalry: 0, siege: 0 });

/** Talent effects of a hero with rank multiplier applied. */
export function talentEffects(state: GameState, heroId: string): { e: EffectData; rank: number }[] {
  const hs = state.heroes[heroId];
  const out: { e: EffectData; rank: number }[] = [];
  if (!hs) return out;
  for (const tid of sortedKeys(hs.talents)) {
    const t = TALENTS[tid];
    const rank = hs.talents[tid] ?? 0;
    if (t && rank > 0) for (const e of t.node.effects) out.push({ e, rank });
  }
  return out;
}

/** `heroId` null/unknown: only clan + research apply (a town defended without a hero). */
export function heroCombatMods(state: GameState, heroId: string | null): HeroCombatMods {
  const m: HeroCombatMods = { classAtkPm: zero(), classDefPm: zero(), classHpPm: zero(), woundedRatioPct: 0, rageGainPct: 0, skillRank: 1 };
  const hs = heroId ? state.heroes[heroId] : undefined;
  if (hs) m.skillRank = skillRankOf(hs);
  const pct = { atk: zero(), def: zero(), hp: zero() };
  const add = (e: EffectData, rank: number, scope: 'talent' | 'global'): void => {
    if (e.kind === 'classAtk') pct.atk[e.class] += e.pct * rank;
    else if (e.kind === 'classDef') pct.def[e.class] += e.pct * rank;
    else if (e.kind === 'classHp') pct.hp[e.class] += e.pct * rank;
    else if (scope === 'talent' && e.kind === 'woundedRatio') m.woundedRatioPct += e.pct * rank;
    else if (e.kind === 'rageGain') m.rageGainPct += e.pct * rank;
  };
  if (heroId) for (const { e, rank } of talentEffects(state, heroId)) add(e, rank, 'talent');
  const clan = CLANS[state.options.clan];
  if (clan) for (const e of clan.effects) add(e, 1, 'global');
  for (const e of researchEffects(state)) add(e, 1, 'global');
  const cap = capFor('classAtk');
  for (const c of CLASSES) {
    m.classAtkPm[c] = Math.min(cap, pct.atk[c]) * 10;
    m.classDefPm[c] = Math.min(cap, pct.def[c]) * 10;
    m.classHpPm[c] = Math.min(cap, pct.hp[c]) * 10;
  }
  return m;
}

/**
 * Collapses class modifiers to the flat per-side permille mods the resolver accepts (`BattleSide.mods`),
 * weighting each class by the number of troops of that class in `troops`.
 */
export function heroSideMods(mods: HeroCombatMods, classCount: Record<string, number>): { atkPm: number; defPm: number; hpPm: number } {
  let total = 0;
  let a = 0;
  let d = 0;
  let h = 0;
  for (const c of CLASSES) {
    const n = classCount[c] ?? 0;
    total += n;
    a += n * mods.classAtkPm[c];
    d += n * mods.classDefPm[c];
    h += n * mods.classHpPm[c];
  }
  if (total <= 0) return { atkPm: 0, defPm: 0, hpPm: 0 };
  return { atkPm: Math.floor(a / total), defPm: Math.floor(d / total), hpPm: Math.floor(h / total) };
}

export interface PlayerSideMods { atkPm: number; defPm: number; hpPm: number; rageGainPct: number; woundedRatioPct: number }

/**
 * The single source of the player's combat modifiers (talents + clan + capped research), used by marches' battles, rallies
 * and raid defence: class bonuses collapsed to flat side mods weighted by the troop classes in `stacks`.
 * (Replaces the raids agent's clan-only `clanSideMods`, so clan classDef/classAtk are applied exactly once.)
 */
export function playerSideMods(state: GameState, heroId: string | null, stacks: readonly Stack[]): PlayerSideMods {
  const mods = heroCombatMods(state, heroId);
  const count: Record<string, number> = {};
  for (const s of stacks) {
    const c = TROOPS[s.troop]?.class;
    if (c) count[c] = (count[c] ?? 0) + s.count;
  }
  const flat = heroSideMods(mods, count);
  return { ...flat, rageGainPct: mods.rageGainPct, woundedRatioPct: mods.woundedRatioPct };
}
