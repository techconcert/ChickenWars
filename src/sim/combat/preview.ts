// Pre-battle brief (bandits.md, combat.md): predicted outcome of a prospective march against a POI.
// Pure; runs the real resolver with fixed roll seeds so the same draft always gives the same brief.
import { SEASON_IDS } from '../constants';
import { HEROES, TROOPS } from '../data/registry';
import { heroStats } from '../heroStats';
import { playerSideMods } from '../heroes/mods';
import { findPath } from '../nav';
import type { GameState, Stack } from '../state';
import { enemyOf } from '../systems/combat';
import { resolveBattle } from './resolver';
import type { BattleHero } from './resolver';
import { recordToStacks, stacksPower } from './power';

export type ClassId = 'infantry' | 'archer' | 'cavalry' | 'siege';
/** Counter triangle (combat.md): the class that beats each enemy class. */
export const COUNTERED_BY: Readonly<Record<ClassId, ClassId>> = { cavalry: 'infantry', infantry: 'archer', archer: 'cavalry', siege: 'cavalry' };

export interface MarchDraft { hero: string; troops: Record<string, number> }
export interface BattlePreview {
  poi: string; name: string; kind: string;
  /** Enemy troops grouped by class (count) and the full stack list. */
  enemyStacks: Stack[]; enemyByClass: Record<ClassId, number>; enemyPower: number; enemyHero: string | null;
  /** Counter classes to bring, strongest need first. */
  recommended: ClassId[];
  palisade: boolean; phase2: boolean;
  /** Present when a draft army was given. */
  outcome: null | {
    win: boolean; winChance: number; lossShare: number; phase2Round: number | null; myPower: number;
    /** Share of the draft's troops that are the recommended counter classes (0..1). */
    counterShare: number;
  };
}

const ROLLS = 9;
const CLASSES: ClassId[] = ['infantry', 'archer', 'cavalry', 'siege'];

function heroOf(state: GameState, id: string): BattleHero | null {
  const h = state.heroes[id];
  if (!h) return null;
  const st = heroStats(state, id);
  const def = HEROES[id];
  return { name: def ? def.name : id, atk: st.atk, def: st.def, hp: st.hp, skill: def ? def.skill : null, skillRank: h.skillRank };
}

function uphillFor(state: GameState, cell: number): number {
  const path = findPath(state.world, state.world.capitalCell, cell, { allowLocked: true });
  const from = path && path.length >= 2 ? path[path.length - 2]! : state.world.capitalCell;
  return Math.max(0, (state.world.level[cell] ?? 0) - (state.world.level[from] ?? 0));
}

export function battlePreview(state: GameState, draft: MarchDraft | null, poiId: string): BattlePreview | null {
  const poi = state.world.pois[poiId];
  if (!poi) return null;
  const enemy = enemyOf(state, poi);
  const byClass: Record<ClassId, number> = { infantry: 0, archer: 0, cavalry: 0, siege: 0 };
  const power: Record<ClassId, number> = { infantry: 0, archer: 0, cavalry: 0, siege: 0 };
  for (const s of enemy.stacks) {
    const t = TROOPS[s.troop];
    if (!t) continue;
    byClass[t.class as ClassId] += s.count;
    power[t.class as ClassId] += stacksPower([s]);
  }
  const recommended: ClassId[] = [];
  for (const c of [...CLASSES].filter((x) => byClass[x] > 0).sort((a, b) => power[b] - power[a] || (a < b ? -1 : 1))) {
    const r = COUNTERED_BY[c];
    if (!recommended.includes(r)) recommended.push(r);
  }
  if (enemy.palisade && !recommended.includes('siege')) recommended.push('siege');
  const out: BattlePreview = {
    poi: poi.id, name: enemy.name, kind: poi.kind, enemyStacks: enemy.stacks, enemyByClass: byClass, enemyPower: stacksPower(enemy.stacks),
    enemyHero: enemy.hero ? enemy.hero.name : null, recommended, palisade: enemy.palisade, phase2: !!enemy.enrage, outcome: null,
  };
  const total = draft ? Object.values(draft.troops).reduce((a, b) => a + b, 0) : 0;
  if (draft && total > 0) {
    const stacks = recordToStacks(draft.troops);
    const uphill = uphillFor(state, poi.cell);
    let wins = 0;
    let loss = 0;
    let p2: number | null = null;
    let first = true;
    let win0 = false;
    for (let i = 0; i < ROLLS; i++) {
      const res = resolveBattle({
        attacker: { name: 'preview', hero: heroOf(state, draft.hero), stacks, mods: playerSideMods(state, draft.hero, stacks) },
        defender: { name: enemy.name, hero: enemy.hero, stacks: enemy.stacks, enrage: enemy.enrage },
        uphillLevels: uphill, winter: SEASON_IDS[state.season.index] === 'winter', palisade: enemy.palisade,
      }, 12345 + i * 7919);
      const won = res.winner === 'attacker';
      if (won) wins++;
      loss += Object.values(res.lossesA).reduce((a, b) => a + b, 0) / total;
      if (first) { first = false; win0 = won; p2 = res.phase2Round; }
    }
    let counter = 0;
    for (const [t, n] of Object.entries(draft.troops)) if (recommended.includes((TROOPS[t]?.class ?? 'infantry') as ClassId)) counter += n;
    out.outcome = {
      win: win0, winChance: Math.round((wins * 100) / ROLLS), lossShare: loss / ROLLS, phase2Round: p2,
      myPower: stacksPower(stacks), counterShare: counter / total,
    };
  }
  return out;
}
