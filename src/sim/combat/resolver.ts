// Pure round-based battle resolver (docs/systems/combat.md). Integer maths, deterministic given (input, rollSeed).
import { BALANCE, SKILLS, TROOPS } from '../data/registry';
import type { SkillDef } from '../data/schema';
import { hash32 } from '../rng';
import type { RoundSummary, Stack } from '../state';
import {
  ALLY_HERO_SHARE_PCT, HERO_ATK_PM, HERO_DEF_PM, HERO_HP_DIV, PALISADE_DEF_PM, RAGE_CASUALTY_FACTOR, RAGE_PER_ROUND,
  VARIANCE_MIN_PCT, VARIANCE_SPAN, WINTER_PM, maxSkillFires, rankScale, uphillPm,
} from './modifiers';
import { stacksPower } from './power';

export interface BattleHero { name: string; atk: number; def: number; hp: number; skill: string | null; skillRank: number }
export interface SideMods { atkPm?: number; defPm?: number; hpPm?: number; /** percent more rage per round (hero talents) */ rageGainPct?: number }
export interface BattleSide {
  name: string; hero: BattleHero | null; stacks: Stack[];
  /** Extra heroes (rallies): their stats count at ALLY_HERO_SHARE_PCT. */
  allies?: BattleHero[]; mods?: SideMods;
  /** Boss phase 2: when this side falls to `belowPct` percent of its starting troops its attack rises by `atkPm` permille (once). */
  enrage?: { belowPct: number; atkPm: number };
}
export interface BattleInput {
  attacker: BattleSide; defender: BattleSide;
  /** Levels the attacker fights uphill (defender higher). <= 0 means none. */
  uphillLevels?: number; winter?: boolean;
  /** Defender palisade (camps): +25% def until the attacker has siege (falls after round 1). */
  palisade?: boolean;
  /** Defender walls (city raids): absorb absorbPct of attacker damage until `hp` is spent. */
  walls?: { hp: number; absorbPct: number } | null;
  /** Defender towers: flat damage per round to the attacker's biggest stack. */
  towers?: { damage: number } | null;
}
export interface BattleResult {
  winner: 'attacker' | 'defender'; rounds: RoundSummary[];
  /** Troops lost per troop id (before the wounded split). */
  lossesA: Record<string, number>; lossesB: Record<string, number>;
  survivorsA: Record<string, number>; survivorsB: Record<string, number>;
  /** Extra wounded share (0..1) from a fired `woundedShare` skill. */
  woundedBonusA: number; woundedBonusB: number;
  rageEvents: { round: number; side: 'A' | 'B'; skill: string }[];
  powerA: number; powerB: number; wallsLeft: number;
  /** Round in which the defender's boss phase 2 began, or null. */
  phase2Round: number | null;
}

type Cls = 'infantry' | 'archer' | 'cavalry' | 'siege';
interface RStack { troop: string; cls: Cls; atk: number; def: number; hp: number; count: number; carry: number; lost: number }
interface Buff { kind: 'atk' | 'classAtk' | 'taken'; cls?: Cls; pm: number; until: number }
interface RSide {
  idx: 0 | 1; stacks: RStack[]; atkPm: number; defPm: number; rage: number; fires: number; hero: BattleHero | null;
  buffs: Buff[]; startTotal: number; woundedBonus: number; rageGainPct: number;
}

/** What each class counters (combat.md plus cavalry over siege). */
const COUNTERS: Record<Cls, readonly Cls[]> = { infantry: ['cavalry'], cavalry: ['archer', 'siege'], archer: ['infantry'], siege: [] };

function mkSide(idx: 0 | 1, side: BattleSide): RSide {
  let atkPm = side.mods?.atkPm ?? 0;
  let defPm = side.mods?.defPm ?? 0;
  let hpPm = side.mods?.hpPm ?? 0;
  const heroes = [...(side.hero ? [{ h: side.hero, share: 100 }] : []), ...(side.allies ?? []).map((h) => ({ h, share: ALLY_HERO_SHARE_PCT }))];
  for (const { h, share } of heroes) {
    atkPm += Math.floor((h.atk * HERO_ATK_PM * share) / 100);
    defPm += Math.floor((h.def * HERO_DEF_PM * share) / 100);
    hpPm += Math.floor((h.hp * share) / (100 * HERO_HP_DIV));
  }
  const merged: Record<string, number> = {};
  for (const s of side.stacks) if (s.count > 0 && TROOPS[s.troop]) merged[s.troop] = (merged[s.troop] ?? 0) + s.count;
  const stacks: RStack[] = Object.keys(merged).sort().map((id) => {
    const t = TROOPS[id]!;
    return {
      troop: id, cls: t.class as Cls, atk: t.atk, def: t.def, hp: Math.max(1, Math.floor((t.hp * (1000 + hpPm)) / 1000)),
      count: merged[id]!, carry: 0, lost: 0,
    };
  });
  let total = 0;
  for (const s of stacks) total += s.count;
  return { idx, stacks, atkPm, defPm, rage: 0, fires: 0, hero: side.hero, buffs: [], startTotal: total, woundedBonus: 0, rageGainPct: side.mods?.rageGainPct ?? 0 };
}

const alive = (s: RSide): number => s.stacks.reduce((n, x) => n + x.count, 0);
const lostOf = (s: RSide): number => s.stacks.reduce((n, x) => n + x.lost, 0);
const hasSiege = (s: RSide): boolean => s.stacks.some((x) => x.cls === 'siege' && x.count > 0);

/** Counter-class first, else highest count; ties by troop id (stacks are kept sorted by id). */
function pickTarget(att: RStack, foe: RSide): RStack | null {
  for (const counterOnly of [true, false]) {
    let best: RStack | null = null;
    for (const t of foe.stacks) {
      if (t.count <= 0) continue;
      if (counterOnly && !COUNTERS[att.cls].includes(t.cls)) continue;
      if (!best || t.count > best.count) best = t;
    }
    if (best) return best;
  }
  return null;
}

function counterPm(att: Cls, def: Cls): number {
  const c = BALANCE.combat;
  if (COUNTERS[att].includes(def)) return Math.round(c.counterMult * 1000);
  if (COUNTERS[def].includes(att) || (att === 'archer' && def === 'siege')) return Math.round(c.counteredMult * 1000);
  return 1000;
}

function buffAtkPm(side: RSide, cls: Cls, round: number): number {
  let pm = 0;
  for (const b of side.buffs) {
    if (b.until < round) continue;
    if (b.kind === 'atk' || (b.kind === 'classAtk' && b.cls === cls)) pm += b.pm;
  }
  return pm;
}
function takenPm(side: RSide, round: number): number {
  let pm = 0;
  for (const b of side.buffs) if (b.kind === 'taken' && b.until >= round) pm += b.pm;
  return Math.max(-900, pm);
}

interface Env { winter: boolean; uphill: number; palisadeUp: boolean; round: number; seed: number }

function atkMultPm(side: RSide, st: RStack, env: Env, isAttacker: boolean): number {
  let pm = 1000 + side.atkPm + buffAtkPm(side, st.cls, env.round);
  if (env.winter) pm -= WINTER_PM;
  if (isAttacker) pm -= uphillPm(env.uphill);
  return Math.max(100, pm);
}
function defValue(side: RSide, st: RStack, env: Env, isAttacker: boolean): number {
  let pm = 1000 + side.defPm;
  if (env.winter) pm -= WINTER_PM;
  if (!isAttacker) {
    pm += uphillPm(env.uphill);
    if (env.palisadeUp) pm += PALISADE_DEF_PM;
  }
  return Math.floor((st.def * Math.max(100, pm)) / 1000);
}

/** Defence reduction: damage / (1 + d/(d+K)) = damage * (d+K) / (2d+K). */
function reduce(dmg: number, def: number): number {
  const K = BALANCE.combat.defenceK;
  return Math.floor((dmg * (def + K)) / (2 * def + K));
}

/** Damage one stack deals to a target. */
function stackDamage(att: RStack, atkSide: RSide, tgt: RStack, tgtSide: RSide, env: Env, isAttacker: boolean, fort: boolean): number {
  let d = Math.floor((att.count * att.atk * atkMultPm(atkSide, att, env, isAttacker)) / 1000);
  d = Math.floor((d * counterPm(att.cls, tgt.cls)) / 1000);
  if (att.cls === 'siege' && fort) d = Math.floor(d * BALANCE.combat.siegeVsFort);
  const v = VARIANCE_MIN_PCT + (hash32(env.seed, 'var', env.round, atkSide.idx, att.troop) % VARIANCE_SPAN);
  d = Math.floor((d * v) / 100);
  d = reduce(d, defValue(tgtSide, tgt, env, !isAttacker));
  const tk = takenPm(tgtSide, env.round);
  if (tk !== 0) d = Math.floor((d * (1000 + tk)) / 1000);
  return Math.max(0, d);
}

/** Apply damage to a stack with HP carry-over; returns troops killed. */
function hit(t: RStack, dmg: number): number {
  if (dmg <= 0 || t.count <= 0) return 0;
  t.carry += dmg;
  const killed = Math.min(t.count, Math.floor(t.carry / t.hp));
  t.carry -= killed * t.hp;
  t.count -= killed;
  t.lost += killed;
  if (t.count === 0) t.carry = 0;
  return killed;
}

function atkPower(side: RSide, env: Env, isAttacker: boolean): number {
  let p = 0;
  for (const s of side.stacks) if (s.count > 0) p += Math.floor((s.count * s.atk * atkMultPm(side, s, env, isAttacker)) / 1000);
  return p;
}

/** Fire `side`'s hero skill against `foe`; returns the burst damage dealt. */
function fireSkill(side: RSide, foe: RSide, sk: SkillDef, env: Env, isAttacker: boolean): number {
  const rank = side.hero?.skillRank ?? 1;
  let dmg = 0;
  const burst = (target: RStack, base: number): void => {
    let d = reduce(base, defValue(foe, target, env, !isAttacker));
    const tk = takenPm(foe, env.round);
    if (tk !== 0) d = Math.floor((d * (1000 + tk)) / 1000);
    dmg += d;
    hit(target, d);
  };
  for (const e of sk.effect) {
    switch (e.kind) {
      case 'damageLargestStack': {
        const base = Math.floor((atkPower(side, env, isAttacker) * rankScale(Math.round(e.mult * 1000), rank)) / 1000);
        let tg: RStack | null = null;
        for (const t of foe.stacks) if (t.count > 0 && (!tg || t.count > tg.count)) tg = t;
        if (tg) burst(tg, base);
        break;
      }
      case 'damageClass': {
        const targets = foe.stacks.filter((t) => t.count > 0 && t.cls === e.class);
        if (targets.length) {
          const total = Math.floor((atkPower(side, env, isAttacker) * rankScale(Math.round(e.mult * 1000), rank)) / 1000);
          const each = Math.floor(total / targets.length);
          for (const t of targets) burst(t, each);
        }
        break;
      }
      case 'buffAtk':
        side.buffs.push({ kind: 'atk', pm: rankScale(e.pct * 10, rank), until: env.round + e.rounds - 1 });
        break;
      case 'buffClassAtk':
        side.buffs.push({ kind: 'classAtk', cls: e.class, pm: rankScale(e.pct * 10, rank), until: env.round + e.rounds - 1 });
        break;
      case 'damageTaken':
        side.buffs.push({ kind: 'taken', pm: (e.pct < 0 ? -1 : 1) * rankScale(Math.abs(e.pct) * 10, rank), until: env.round + e.rounds - 1 });
        break;
      case 'woundedShare':
        side.woundedBonus += rankScale(e.pct * 10, rank) / 1000;
        break;
    }
  }
  return dmg;
}

function recOf(side: RSide, pick: (s: RStack) => number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of side.stacks) {
    const v = pick(s);
    if (v > 0) out[s.troop] = v;
  }
  return out;
}

export function resolveBattle(input: BattleInput, rollSeed: number): BattleResult {
  const A = mkSide(0, input.attacker);
  const B = mkSide(1, input.defender);
  const rounds: RoundSummary[] = [];
  const rageEvents: BattleResult['rageEvents'] = [];
  let walls = input.walls ? input.walls.hp : 0;
  const wallPct = input.walls ? input.walls.absorbPct : 0;
  const towerDmg = input.towers ? input.towers.damage : 0;
  const enrage = input.defender.enrage;
  let phase2Round: number | null = null;

  for (let round = 1; round <= BALANCE.combat.maxRounds && alive(A) > 0 && alive(B) > 0; round++) {
    const palisadeUp = !!input.palisade && (round === 1 || !hasSiege(A));
    const env: Env = { winter: !!input.winter, uphill: input.uphillLevels ?? 0, palisadeUp, round, seed: rollSeed };
    const fort = palisadeUp || walls > 0;
    let dmgA = 0;
    let dmgB = 0;
    const lostA0 = lostOf(A);
    const lostB0 = lostOf(B);

    // 0. Boss phase 2: the defender enrages once it has lost half its troops.
    if (enrage && phase2Round === null && alive(B) * 100 <= B.startTotal * enrage.belowPct) {
      phase2Round = round;
      B.atkPm += enrage.atkPm;
      rageEvents.push({ round, side: 'B', skill: 'boss_enrage' });
    }

    // 1. Hero skills fire at the start of the round once rage reached the threshold.
    for (const [side, foe] of [[A, B], [B, A]] as const) {
      const id = side.hero?.skill;
      const sk = id ? SKILLS[id] : undefined;
      if (!sk || !side.hero) continue;
      if (side.rage >= sk.rage && side.fires < maxSkillFires(side.hero.skillRank) && alive(side) > 0 && alive(foe) > 0) {
        side.rage = 0;
        side.fires += 1;
        rageEvents.push({ round, side: side.idx === 0 ? 'A' : 'B', skill: sk.id });
        const d = fireSkill(side, foe, sk, env, side.idx === 0);
        if (side.idx === 0) dmgA += d; else dmgB += d;
      }
    }

    // 2. Exchange. Round 1: archers volley first, everyone else fires after those casualties are applied.
    const phases: ((s: RStack) => boolean)[] = round === 1 ? [(s) => s.cls === 'archer', (s) => s.cls !== 'archer'] : [() => true];
    for (const sel of phases) {
      const inc = new Map<RStack, number>();
      let wallSpent = 0;
      for (const [side, foe, isAtt] of [[A, B, true], [B, A, false]] as const) {
        for (const st of side.stacks) {
          if (st.count <= 0 || !sel(st)) continue;
          const tg = pickTarget(st, foe);
          if (!tg) continue;
          let d = stackDamage(st, side, tg, foe, env, isAtt, fort);
          if (isAtt && wallPct > 0 && walls - wallSpent > 0) {
            // Walls soak a share of the damage; siege wears them down faster.
            const share = Math.floor((d * wallPct) / 100);
            const wear = st.cls === 'siege' ? Math.floor(share * BALANCE.combat.siegeVsFort) : share;
            const left = walls - wallSpent;
            if (wear <= left) { wallSpent += wear; d -= share; } else { wallSpent = walls; d -= Math.floor((share * left) / wear); }
          }
          if (isAtt) dmgA += d; else dmgB += d;
          inc.set(tg, (inc.get(tg) ?? 0) + d);
        }
      }
      walls -= wallSpent;
      for (const [tg, d] of inc) hit(tg, d);
    }

    // 3. Defender towers shoot the attacker's biggest stack.
    if (towerDmg > 0 && alive(B) > 0) {
      let tg: RStack | null = null;
      for (const t of A.stacks) if (t.count > 0 && (!tg || t.count > tg.count)) tg = t;
      if (tg) { hit(tg, towerDmg); dmgB += towerDmg; }
    }

    // 4. Rage and round summary.
    const lostA = lostOf(A) - lostA0;
    const lostB = lostOf(B) - lostB0;
    for (const [side, lost] of [[A, lostA], [B, lostB]] as const) {
      side.rage += Math.floor((RAGE_PER_ROUND * (100 + side.rageGainPct)) / 100) + (side.startTotal > 0 ? Math.floor((lost * RAGE_CASUALTY_FACTOR) / side.startTotal) : 0);
    }
    rounds.push({ n: round, damageA: dmgA, damageB: dmgB, lossesA: lostA, lossesB: lostB });
  }

  const powerOf = (s: RSide): number => stacksPower(s.stacks.map((x) => ({ troop: x.troop, count: x.count })));
  const powerA = powerOf(A);
  const powerB = powerOf(B);
  let winner: 'attacker' | 'defender';
  if (alive(A) === 0) winner = 'defender';
  else if (alive(B) === 0) winner = 'attacker';
  else winner = powerA > powerB ? 'attacker' : 'defender';
  return {
    winner, rounds,
    lossesA: recOf(A, (s) => s.lost), lossesB: recOf(B, (s) => s.lost),
    survivorsA: recOf(A, (s) => s.count), survivorsB: recOf(B, (s) => s.count),
    woundedBonusA: Math.min(1, A.woundedBonus), woundedBonusB: Math.min(1, B.woundedBonus),
    rageEvents, powerA, powerB, wallsLeft: walls, phase2Round,
  };
}
