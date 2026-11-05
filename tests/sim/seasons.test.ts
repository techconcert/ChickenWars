import { describe, expect, it } from 'vitest';
import { DAY_TICKS, SEASON_DAYS, YEAR_DAYS } from '@sim/constants';
import { advance, SYSTEMS } from '@sim/tick';
import { BALANCE, WORLD } from '@sim/data/registry';
import { gatherPerTick, marchSpeedMult, upkeepPerMinute as marchUpkeep } from '@sim/nav/marchCore';
import { growCamp } from '@sim/systems/bandits';
import type { MarchState, PoiState } from '@sim/state';
import { makeState } from '../helpers/makeState';

describe('seasons', () => {
  it('advances days and seasons with events (river_valley, 20-day seasons)', () => {
    const s = makeState();
    const changes: number[] = [];
    for (let i = 0; i < YEAR_DAYS * DAY_TICKS + 1; i++) {
      for (const e of advance(s)) if (e.t === 'SeasonChanged') changes.push(e.season);
    }
    expect(changes).toEqual([1, 2, 3, 0]);
    expect(s.season.year).toBe(1);
    expect(s.season.day).toBe(YEAR_DAYS);
    expect(s.season.index).toBe(0);
    expect(s.season.dayOfSeason).toBe(0);
    expect(SEASON_DAYS * 4).toBe(YEAR_DAYS);
  });

  it('honours start type season lengths (frozen_north)', () => {
    const s = makeState({ options: { startType: 'frozen_north' } });
    const at: number[] = [];
    for (let i = 0; i < 40 * DAY_TICKS + 1; i++) for (const e of advance(s)) if (e.t === 'SeasonChanged') at.push(e.tick / DAY_TICKS);
    expect(at).toEqual([15, 25, 40]);
  });

  it('system order is fixed', () => {
    expect(SYSTEMS.map((x) => x.name)).toEqual(['seasons', 'city', 'economy', 'military', 'research', 'heroes', 'marches', 'combat', 'bandits', 'allies', 'world', 'quests']);
  });

  it('rejected commands emit CommandRejected and log is trimmed to 200', () => {
    const s = makeState();
    const ev = advance(s, [{ t: 'research', tech: 'nope' }]);
    expect(ev[0]).toMatchObject({ t: 'CommandRejected', cmd: 'research' });
    expect(advance(s, [{ t: 'setSpeed', speed: 2 }])).toEqual([]);
    for (let i = 0; i < 300; i++) advance(s, [{ t: 'research', tech: 'nope' }]);
    expect(s.log.length).toBe(200);
  });
});

describe('season modifiers reach the right systems (M7)', () => {
  const at = (idx: 0 | 1 | 2 | 3) => { const s = makeState({ options: { clan: 'ironvale' } }); s.season.index = idx; return s; };
  it('gather speed, troop upkeep, march speed and bandit growth follow balance.seasonMods', () => {
    const m = BALANCE.seasonMods;
    const names = ['spring', 'summer', 'autumn', 'winter'] as const;
    const march = { id: 'm', hero: 'aldric', troops: { militia: 10 }, kind: 'gather', target: {}, path: [0], step: 0, progress: 0, state: 'gathering', carried: {}, supply: 0, startedAt: 0 } as unknown as MarchState;
    const base = gatherPerTick(at(0), march) / m.spring.gather;
    const ms0 = marchSpeedMult(at(0), 'aldric') / m.spring.marchSpeed;
    const up0 = marchUpkeep(at(0), { militia: 10 }) / m.spring.upkeep;
    names.forEach((n, i) => {
      const s = at(i as 0 | 1 | 2 | 3);
      expect(gatherPerTick(s, march)).toBeCloseTo(base * m[n].gather, 6);
      expect(marchSpeedMult(s, 'aldric')).toBeCloseTo(ms0 * m[n].marchSpeed, 6);
      expect(marchUpkeep(s, { militia: 10 })).toBeCloseTo(up0 * m[n].upkeep, 6);
      const p: PoiState = { id: 'c', kind: 'bandit_camp', cell: 1, region: 0, tier: 1, level: 1, active: true, troops: [], strength: 100, respawnAt: null, raidReadyAt: 0 };
      growCamp(s, p);
      expect(p.strength - 100).toBeCloseTo(WORLD.banditCamps[0]!.growthPerDay * m[n].banditGrowth * BALANCE.difficulty[s.options.difficulty].banditGrowth, 6);
    });
    expect(m.winter.gather).toBeLessThan(m.spring.gather);
    expect(m.winter.banditGrowth).toBeGreaterThan(m.summer.banditGrowth);
  });

  it('a full year of seasons is deterministic', () => {
    const run = (): number => { const s = at(0); for (let i = 0; i < 80 * 600; i++) advance(s); return s.tick * 1000 + s.season.year * 10 + s.season.index; };
    expect(run()).toBe(run());
  });
});
