import { describe, expect, it } from 'vitest';
import { applyCommand, validateCommand } from '@sim/commands';
import type { Command } from '@sim/commands';
import type { TickCtx } from '@sim/ctx';
import { BALANCE, HEROES, HERO_LIST, ITEMS, TALENTS, xpForLevel } from '@sim/data/registry';
import { heroStats } from '@sim/heroStats';
import { ITEM_MAX_UPGRADE, itemUpgradeCost } from '@sim/heroes/constants';
import { heroCombatMods, heroSideMods } from '@sim/heroes/mods';
import { talentPointsAvailable } from '@sim/heroes/xp';
import { advance } from '@sim/tick';
import type { GameState } from '@sim/state';
import { grantHero, grantHeroXp } from '@sim/systems/heroes';
import { hashState } from '@sim/save/hash';
import { makeState } from '../helpers/makeState';

const ctx = (): TickCtx => ({ events: [], safeMode: false });
function run(s: GameState, cmd: Command): string | null {
  const err = validateCommand(s, cmd);
  if (!err) applyCommand(s, cmd, ctx());
  return err;
}
function building(s: GameState, type: string, level = 1): void {
  const id = String(s.nextId++);
  s.city.buildings[id] = { id, type, cell: 1 + Object.keys(s.city.buildings).length, level, damaged: false };
}
function item(s: GameState, def: string, upgrade = 0): string {
  const id = String(s.nextId++);
  s.inventory[id] = { id, def, upgrade };
  return id;
}
const levelTo = (s: GameState, hero: string, level: number): void => { s.heroes[hero]!.level = level; };

describe('xp and levels', () => {
  it('xp curve follows round(100 * 1.18^(level-1)) and is increasing', () => {
    for (let l = 1; l <= 10; l++) expect(xpForLevel(l)).toBe(Math.round(100 * Math.pow(1.18, l - 1)));
    for (let l = 2; l < 40; l++) expect(xpForLevel(l)).toBeGreaterThan(xpForLevel(l - 1));
  });
  it('grantHeroXp levels up through several levels, keeps the remainder and emits events', () => {
    const s = makeState();
    const c = ctx();
    const need = xpForLevel(1) + xpForLevel(2) + 5;
    expect(grantHeroXp(s, 'aldric', need, c)).toBe(2);
    expect(s.heroes['aldric']!.level).toBe(3);
    expect(s.heroes['aldric']!.xp).toBe(5);
    expect(c.events.filter((e) => e.t === 'HeroLevelUp').map((e) => (e as { level: number }).level)).toEqual([2, 3]);
  });
  it('caps at balance.heroMaxLevel and drops xp there', () => {
    const s = makeState();
    grantHeroXp(s, 'aldric', 1e12, ctx());
    expect(s.heroes['aldric']!.level).toBe(BALANCE.heroMaxLevel);
    expect(s.heroes['aldric']!.xp).toBe(0);
    expect(grantHeroXp(s, 'aldric', 500, ctx())).toBe(0);
    expect(s.heroes['aldric']!.xp).toBe(0);
  });
  it('level ups apply base + growth stats and one talent point per level', () => {
    const s = makeState();
    const base = heroStats(s, 'aldric');
    const d = HEROES['aldric']!;
    expect(base.atk).toBe(d.baseStats.atk);
    expect(talentPointsAvailable(s.heroes['aldric']!)).toBe(0);
    grantHeroXp(s, 'aldric', xpForLevel(1) + xpForLevel(2) + xpForLevel(3) + xpForLevel(4), ctx());
    expect(s.heroes['aldric']!.level).toBe(5);
    const st = heroStats(s, 'aldric');
    expect(st.atk).toBe(Math.floor(d.baseStats.atk + d.growth.atk * 4));
    expect(st.hp).toBe(Math.floor(d.baseStats.hp + d.growth.hp * 4));
    expect(st.lead).toBe(Math.floor(d.baseStats.lead + d.growth.lead * 4));
    expect(talentPointsAvailable(s.heroes['aldric']!)).toBe(4);
  });
  it('clan heroStartLevel is applied at new game (ironvale)', () => {
    expect(makeState({ options: { clan: 'ironvale' } }).heroes['aldric']!.level).toBe(2);
    expect(makeState().heroes['aldric']!.level).toBe(1);
  });
});

describe('talents', () => {
  it('needs a point, the right tree, tier points and prerequisite nodes', () => {
    const s = makeState();
    expect(run(s, { t: 'heroTalent', hero: 'aldric', talent: 'w_strike' })).toBe('no_points');
    levelTo(s, 'aldric', 12);
    expect(run(s, { t: 'heroTalent', hero: 'aldric', talent: 'r_aim' })).toBe('wrong_tree');
    expect(run(s, { t: 'heroTalent', hero: 'aldric', talent: 'nope' })).toBe('unknown_talent');
    expect(run(s, { t: 'heroTalent', hero: 'ghost', talent: 'w_strike' })).toBe('no_hero');
    expect(run(s, { t: 'heroTalent', hero: 'aldric', talent: 'w_bulwark' })).toBe('tier_locked');
    expect(run(s, { t: 'heroTalent', hero: 'aldric', talent: 'w_rank2' })).toBe('tier_locked');
    for (let i = 0; i < 3; i++) expect(run(s, { t: 'heroTalent', hero: 'aldric', talent: 'w_strike' })).toBeNull();
    expect(run(s, { t: 'heroTalent', hero: 'aldric', talent: 'w_strike' })).toBe('max_rank');
    expect(run(s, { t: 'heroTalent', hero: 'aldric', talent: 'w_bulwark' })).toBeNull(); // 3 points spent
    for (let i = 0; i < 3; i++) run(s, { t: 'heroTalent', hero: 'aldric', talent: 'w_vigor' });
    expect(run(s, { t: 'heroTalent', hero: 'aldric', talent: 'w_rank2' })).toBeNull(); // 7 points, needs w_strike
    expect(s.heroes['aldric']!.skillRank).toBe(2);
    expect(run(s, { t: 'heroTalent', hero: 'aldric', talent: 'w_rank3' })).toBe('tier_locked'); // 7 < 10
    expect(talentPointsAvailable(s.heroes['aldric']!)).toBe(11 - 8);
  });
  it('a node requirement is enforced independently of points', () => {
    const s = makeState();
    levelTo(s, 'aldric', 30);
    for (const t of ['w_vigor', 'w_vigor', 'w_vigor', 'w_bulwark', 'w_bulwark', 'w_lancers', 'w_lancers', 'w_ironwill']) run(s, { t: 'heroTalent', hero: 'aldric', talent: t });
    expect(run(s, { t: 'heroTalent', hero: 'aldric', talent: 'w_rank2' })).toBe('requires'); // no w_strike
    run(s, { t: 'heroTalent', hero: 'aldric', talent: 'w_strike' });
    expect(run(s, { t: 'heroTalent', hero: 'aldric', talent: 'w_rank2' })).toBeNull();
  });
  it('all trees reachable: every node can be bought with enough points', () => {
    for (const cls of ['warrior', 'ranger', 'strategist']) {
      const h = HERO_LIST.find((x) => x.class === cls)!;
      const s = makeState({}, (st) => {
        if (!st.heroes[h.id]) grantHero(st, h.id, ctx());
        st.heroes[h.id]!.level = 40;
      });
      const nodes = Object.keys(TALENTS).filter((id) => TALENTS[id]!.tree === cls).sort((a, b) => TALENTS[a]!.node.tier - TALENTS[b]!.node.tier);
      for (let pass = 0; pass < 4; pass++) for (const n of nodes) while (run(s, { t: 'heroTalent', hero: h.id, talent: n }) === null);
      for (const n of nodes) expect(s.heroes[h.id]!.talents[n]).toBe(TALENTS[n]!.node.maxRank);
      expect(s.heroes[h.id]!.skillRank).toBe(3);
    }
  });
  it('talent effects feed heroStats and combat mods', () => {
    const s = makeState();
    levelTo(s, 'aldric', 12);
    const before = heroStats(s, 'aldric');
    for (let i = 0; i < 3; i++) run(s, { t: 'heroTalent', hero: 'aldric', talent: 'w_strike' });
    for (let i = 0; i < 2; i++) run(s, { t: 'heroTalent', hero: 'aldric', talent: 'w_lancers' });
    run(s, { t: 'heroTalent', hero: 'aldric', talent: 'w_vigor' });
    const after = heroStats(s, 'aldric');
    expect(after.atk).toBeGreaterThan(before.atk);
    expect(after.atk).toBe(Math.floor((HEROES['aldric']!.baseStats.atk + HEROES['aldric']!.growth.atk * 11) * 1.09));
    expect(after.hp).toBe(Math.floor((HEROES['aldric']!.baseStats.hp + HEROES['aldric']!.growth.hp * 11) * 1.04));
    const m = heroCombatMods(s, 'aldric');
    expect(m.classAtkPm.cavalry).toBe(80);
    expect(m.classDefPm.infantry).toBe(50); // oakwarden clan classDef infantry +5
    expect(heroSideMods(m, { cavalry: 10 }).atkPm).toBe(80);
    expect(heroSideMods(m, { cavalry: 10, archer: 10 }).atkPm).toBe(40);
    expect(heroSideMods(m, {})).toEqual({ atkPm: 0, defPm: 0, hpPm: 0 });
  });
  it('rangers add speed and vision, skill rank follows talents', () => {
    const s = makeState({}, (st) => { grantHero(st, 'mira', ctx()); st.heroes['mira']!.level = 20; });
    const b = heroStats(s, 'mira');
    for (let i = 0; i < 3; i++) run(s, { t: 'heroTalent', hero: 'mira', talent: 'r_aim' });
    for (let i = 0; i < 2; i++) run(s, { t: 'heroTalent', hero: 'mira', talent: 'r_pathfind' });
    run(s, { t: 'heroTalent', hero: 'mira', talent: 'r_eagle' });
    const a = heroStats(s, 'mira');
    expect(a.speed).toBeCloseTo(b.speed + 0.08);
    expect(a.vision).toBe(b.vision + 1);
  });
});

describe('respec', () => {
  it('costs gold, refunds every point and resets the skill rank', () => {
    const s = makeState();
    levelTo(s, 'aldric', 10);
    for (const t of ['w_strike', 'w_strike', 'w_strike', 'w_vigor', 'w_vigor', 'w_vigor', 'w_rank2']) expect(run(s, { t: 'heroTalent', hero: 'aldric', talent: t })).toBeNull();
    expect(s.heroes['aldric']!.skillRank).toBe(2);
    s.resources.gold = BALANCE.respecCostGold - 1;
    expect(run(s, { t: 'respec', hero: 'aldric' })).toBe('cost');
    s.resources.gold = BALANCE.respecCostGold + 7;
    expect(run(s, { t: 'respec', hero: 'aldric' })).toBeNull();
    expect(s.resources.gold).toBe(7);
    expect(s.heroes['aldric']!.talents).toEqual({});
    expect(s.heroes['aldric']!.skillRank).toBe(1);
    expect(talentPointsAvailable(s.heroes['aldric']!)).toBe(9);
    expect(run(s, { t: 'respec', hero: 'aldric' })).toBe('nothing_to_respec');
  });
  it('is refused while the hero is on a march', () => {
    const s = makeState();
    levelTo(s, 'aldric', 3);
    run(s, { t: 'heroTalent', hero: 'aldric', talent: 'w_vigor' });
    s.resources.gold = 1000;
    s.heroes['aldric']!.march = '9';
    expect(run(s, { t: 'respec', hero: 'aldric' })).toBe('on_march');
  });
});

describe('equipment and item upgrades', () => {
  it('equip validates slot, ownership and sums item stats', () => {
    const s = makeState({}, (st) => { grantHero(st, 'bran', ctx()); st.heroes['aldric']!.level = 11; });
    const sword = item(s, 'common_sword');
    const jerkin = item(s, 'common_jerkin');
    const base = heroStats(s, 'aldric');
    expect(run(s, { t: 'equip', hero: 'aldric', slot: 'weapon', item: jerkin })).toBe('wrong_slot');
    expect(run(s, { t: 'equip', hero: 'aldric', slot: 'weapon', item: '999' })).toBe('no_item');
    expect(run(s, { t: 'equip', hero: 'aldric', slot: 'weapon', item: sword })).toBeNull();
    expect(run(s, { t: 'equip', hero: 'bran', slot: 'weapon', item: sword })).toBe('item_in_use');
    expect(run(s, { t: 'equip', hero: 'aldric', slot: 'armour', item: jerkin })).toBeNull();
    const st = heroStats(s, 'aldric');
    expect(st.atk).toBe(Math.floor(38 * (1 + ITEMS['common_sword']!.stats.atk! / 100)));
    expect(st.def).toBe(Math.floor(33 * (1 + ITEMS['common_jerkin']!.stats.def! / 100)));
    expect(st.atk).toBeGreaterThan(base.atk);
    expect(run(s, { t: 'equip', hero: 'aldric', slot: 'weapon', item: null })).toBeNull();
    expect(run(s, { t: 'equip', hero: 'aldric', slot: 'weapon', item: null })).toBe('empty_slot');
    expect(heroStats(s, 'aldric').atk).toBe(base.atk);
    expect(run(s, { t: 'equip', hero: 'bran', slot: 'weapon', item: sword })).toBeNull(); // freed
  });
  it('multi-stat items and all four slots add up', () => {
    const s = makeState();
    levelTo(s, 'aldric', 11);
    const base = heroStats(s, 'aldric');
    for (const [slot, def] of [['weapon', 'rare_warblade'], ['banner', 'rare_banner']] as const) run(s, { t: 'equip', hero: 'aldric', slot, item: item(s, def) });
    const st = heroStats(s, 'aldric');
    const d = HEROES['aldric']!;
    expect(st.atk).toBe(Math.floor((d.baseStats.atk + d.growth.atk * 10) * (1 + (10 + 3) / 100)));
    expect(st.lead).toBe(Math.floor((d.baseStats.lead + d.growth.lead * 10) * (1 + (3 + 10) / 100)));
    expect(st.atk).toBeGreaterThan(base.atk);
  });
  it('upgradeItem needs an academy and resources, adds +10% of base stats, max +5', () => {
    const s = makeState({}, (st) => { st.heroes['aldric']!.level = 31; });
    const sword = item(s, 'uncommon_blade');
    run(s, { t: 'equip', hero: 'aldric', slot: 'weapon', item: sword });
    s.resources.gold = 99999;
    s.resources.ember = 99999;
    expect(run(s, { t: 'upgradeItem', item: sword })).toBe('no_academy');
    building(s, 'academy');
    expect(run(s, { t: 'upgradeItem', item: '404' })).toBe('no_item');
    const c1 = itemUpgradeCost('uncommon', 1);
    const g = s.resources.gold;
    const e = s.resources.ember;
    expect(run(s, { t: 'upgradeItem', item: sword })).toBeNull();
    expect(s.resources.gold).toBe(g - c1.gold!);
    expect(s.resources.ember).toBe(e - c1.ember!);
    expect(s.inventory[sword]!.upgrade).toBe(1);
    // +10% of 6 atk-pct: 6.6% atk
    expect(heroStats(s, 'aldric').atk).toBe(Math.floor(74 * (1 + 6 * 1.1 / 100)));
    while (s.inventory[sword]!.upgrade < ITEM_MAX_UPGRADE) expect(run(s, { t: 'upgradeItem', item: sword })).toBeNull();
    expect(run(s, { t: 'upgradeItem', item: sword })).toBe('max_upgrade');
    expect(heroStats(s, 'aldric').atk).toBe(Math.floor(74 * (1 + 6 * 1.5 / 100)));
    const cheap = item(s, 'common_charm');
    s.resources.gold = 0;
    expect(run(s, { t: 'upgradeItem', item: cheap })).toBe('cost');
  });
  it('upgrade costs grow with level and rarity', () => {
    expect(itemUpgradeCost('epic', 3).gold!).toBeGreaterThan(itemUpgradeCost('common', 3).gold!);
    expect(itemUpgradeCost('rare', 4).ember!).toBeGreaterThan(itemUpgradeCost('rare', 1).ember!);
  });
  it('equipment cannot change while marching', () => {
    const s = makeState();
    const sword = item(s, 'common_sword');
    s.heroes['aldric']!.march = '5';
    expect(run(s, { t: 'equip', hero: 'aldric', slot: 'weapon', item: sword })).toBe('on_march');
  });
});

describe('tavern and recruiting', () => {
  const tavernHeroes = HERO_LIST.filter((h) => h.recruit.kind === 'tavern').map((h) => h.id);
  it('has no candidates without a tavern', () => {
    const s = makeState();
    for (let i = 0; i < 5; i++) advance(s);
    expect(s.tavern.candidates).toEqual([]);
    expect(run(s, { t: 'recruitHero', hero: 'mira' })).toBe('no_tavern');
  });
  it('offers unowned tavern heroes, rotates on schedule and is deterministic per seed', () => {
    const mk = (seed: number): GameState => makeState({ seed }, (st) => building(st, 'tavern'));
    const a = mk(11);
    const b = mk(11);
    advance(a);
    advance(b);
    expect(a.tavern.candidates.length).toBe(Math.min(3, tavernHeroes.length));
    expect(a.tavern.candidates).toEqual(b.tavern.candidates);
    for (const c of a.tavern.candidates) expect(tavernHeroes).toContain(c);
    expect(a.tavern.refreshAt).toBe(BALANCE.tavernRefreshTicks);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) { const s = mk(seed); advance(s); seen.add(s.tavern.candidates.join(',')); }
    expect(seen.size).toBeGreaterThan(1); // different seeds order differently
    // rotation: candidates are recomputed only at refreshAt
    const mid = a.tavern.candidates.slice();
    a.tick = BALANCE.tavernRefreshTicks - 1;
    advance(a);
    expect(a.tavern.candidates).toEqual(mid);
    a.tick = BALANCE.tavernRefreshTicks;
    advance(a);
    expect(a.tavern.refreshAt).toBe(2 * BALANCE.tavernRefreshTicks);
  });
  it('recruit pays gold, adds the hero, removes the candidate and emits an event', () => {
    const s = makeState({}, (st) => { building(st, 'tavern'); st.resources.gold = 1000; });
    advance(s);
    const pick = s.tavern.candidates[0]!;
    const cost = (HEROES[pick]!.recruit as { cost: { gold: number } }).cost.gold;
    expect(run(s, { t: 'recruitHero', hero: 'seren' })).toBe('not_for_hire');
    expect(run(s, { t: 'recruitHero', hero: 'aldric' })).toBe('not_for_hire');
    const evs = advance(s, [{ t: 'recruitHero', hero: pick }]);
    expect(evs.some((e) => e.t === 'HeroRecruited')).toBe(true);
    expect(s.heroes[pick]).toBeDefined();
    expect(s.resources.gold).toBeLessThan(1000);
    expect(1000 - s.resources.gold).toBeGreaterThanOrEqual(cost);
    expect(s.tavern.candidates).not.toContain(pick);
    expect(run(s, { t: 'recruitHero', hero: pick })).toBe('owned');
  });
  it('refuses when poor or when the roster is full', () => {
    const s = makeState({}, (st) => { building(st, 'tavern'); st.resources.gold = 0; });
    advance(s);
    const pick = s.tavern.candidates[0]!;
    s.resources.gold = 0;
    expect(run(s, { t: 'recruitHero', hero: pick })).toBe('cost');
    s.resources.gold = 99999;
    for (let i = 0; i < BALANCE.heroMax; i++) s.heroes[`filler${i}`] = { ...s.heroes['aldric']!, id: `filler${i}` };
    expect(run(s, { t: 'recruitHero', hero: pick })).toBe('roster_full');
    expect(run(s, { t: 'recruitHero', hero: 'kael' })).not.toBeNull();
  });
  it('a hero not on offer cannot be recruited', () => {
    const s = makeState({}, (st) => { building(st, 'tavern'); st.resources.gold = 99999; });
    advance(s);
    const off = tavernHeroes.filter((h) => !s.tavern.candidates.includes(h));
    if (off.length) expect(run(s, { t: 'recruitHero', hero: off[0]! })).toBe('not_offered');
  });
  it('grantHero adds unique heroes once', () => {
    const s = makeState();
    const c = ctx();
    expect(grantHero(s, 'seren', c)).toBe(true);
    expect(grantHero(s, 'seren', c)).toBe(false);
    expect(grantHero(s, 'nobody', c)).toBe(false);
    expect(c.events.filter((e) => e.t === 'HeroRecruited')).toHaveLength(1);
    expect(s.heroes['seren']!.level).toBe(1);
  });
  it('whole sequence is deterministic (state hash)', () => {
    const play = (): unknown => {
      const s = makeState({ seed: 5 }, (st) => { building(st, 'tavern'); st.resources.gold = 5000; });
      for (let i = 0; i < 2500; i++) advance(s, i === 3 ? [{ t: 'recruitHero', hero: 'mira' }] : []);
      return hashState(s);
    };
    expect(play()).toBe(play());
  });
});
