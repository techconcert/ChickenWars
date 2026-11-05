import { describe, expect, it } from 'vitest';
import { lootShares, rallyAugment, rallySplit } from '@sim/allies';
import type { BattleResult } from '@sim/combat/resolver';
import type { GameEvent } from '@sim/events';
import type { GameState } from '@sim/state';
import { advance } from '@sim/tick';
import { makeState } from '../helpers/makeState';
import { addCamp } from './raidsSetup';

const rej = (evs: GameEvent[]): string | null => { const e = evs.find((x) => x.t === 'CommandRejected'); return e && e.t === 'CommandRejected' ? e.code : null; };

function rallySetup(allied: string[] = ['a']): { s: GameState; lords: string[] } {
  const s = makeState();
  for (const id of Object.keys(s.world.pois)) if (s.world.pois[id]!.kind === 'bandit_camp') delete s.world.pois[id];
  addCamp(s, 'tgt', 2, 300, 6);
  const lords = Object.keys(s.lords).sort().slice(0, allied.length);
  for (const l of lords) s.lords[l]!.rep = 80;
  s.troops.footman!.healthy = 200;
  s.troops.bowman!.healthy = 100;
  return { s, lords };
}
const CMD = { t: 'startRally' as const, hero: 'aldric', troops: { footman: 60, bowman: 30 }, target: 'tgt' };

describe('loot share', () => {
  it('always sums to exactly 100% (permille) and favours the player at 60%', () => {
    for (const c of [{} as Record<string, number>, { a: 1 }, { a: 100, b: 100 }, { a: 7, b: 13, c: 29 }, { a: 1, b: 1, c: 1 }]) {
      const sh = lootShares(60, c);
      const total = sh.player + Object.values(sh.lords).reduce((x, y) => x + y, 0);
      expect(total).toBe(1000);
      if (Object.keys(c).length) expect(sh.player).toBe(600);
    }
    const sh = lootShares(60, { a: 300, b: 100 });
    expect(sh.lords.a).toBe(300);
    expect(sh.lords.b).toBe(100);
  });
});

describe('rallies', () => {
  it('need an allied lord and a valid target', () => {
    const s = makeState();
    addCamp(s, 'tgt', 2, 300, 6);
    s.troops.footman!.healthy = 200;
    expect(rej(advance(s, [CMD]))).toBe('no_ally');
    const lord = Object.keys(s.lords)[0]!;
    s.lords[lord]!.rep = 80;
    expect(rej(advance(s, [{ ...CMD, target: 'missing' }]))).toBe('bad_target');
  });

  it('the march waits at the capital, lords arrive after a distance delay, then it departs and fights combined', () => {
    const { s, lords } = rallySetup();
    const evs = advance(s, [CMD]);
    expect(rej(evs)).toBeNull();
    expect(evs.some((e) => e.t === 'RallyStarted')).toBe(true);
    const m = Object.values(s.marches)[0]!;
    expect(m.kind).toBe('rally');
    expect(m.state).toBe('done');
    const rally = Object.values(s.rallies)[0]!;
    expect(rally.lords).toEqual(lords);
    expect(rally.waitUntil - s.tick).toBeLessThanOrEqual(1800);
    let joined = false;
    let departedAt = -1;
    for (let i = 0; i < 3000 && s.rallies[rally.id]; i++) {
      for (const e of advance(s, [])) {
        if (e.t === 'RallyJoined') { joined = true; expect(e.tick).toBeGreaterThanOrEqual(rally.arriveAt![e.lord]!); }
        if (e.t === 'RallyDeparted') departedAt = e.tick;
      }
      if (departedAt >= 0 && m.state === 'returning') break;
    }
    expect(joined).toBe(true);
    expect(departedAt).toBeGreaterThan(0);
    expect(departedAt).toBeLessThanOrEqual(rally.waitUntil);
    expect(s.reports).toHaveLength(1);
    expect(s.reports[0]!.winner).toBe('attacker');
    expect(s.rallies[rally.id]).toBeUndefined();
    // The lords' troops are synthetic: nothing leaks into the player's army.
    const total = Object.values(m.troops).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(90);
    expect(s.lords[lords[0]!]!.rep).toBeGreaterThan(80 - 1);
  });

  it('allied armies and heroes strengthen the fight', () => {
    const { s } = rallySetup();
    advance(s, [CMD]);
    const m = Object.values(s.marches)[0]!;
    const rally = Object.values(s.rallies)[0]!;
    expect(rallyAugment(s, m).extraStacks).toEqual([]);
    rally.arrived.push(...rally.lords);
    const aug = rallyAugment(s, m);
    expect(aug.extraStacks.length).toBeGreaterThan(0);
    expect(aug.allyHeroes.length).toBeGreaterThan(0);
    expect(aug.allyHeroes.length).toBeLessThanOrEqual(2);
    expect(rally.contrib!.player).toBeGreaterThan(0);
  });

  it('splits combined losses so the player never loses more than he brought', () => {
    const res = { lossesA: { footman: 30 }, survivorsA: { footman: 50 } } as unknown as BattleResult;
    rallySplit(res, [{ troop: 'footman', count: 20 }], [{ troop: 'footman', count: 60 }]);
    expect(res.lossesA).toEqual({ footman: 8 });
    expect(res.survivorsA).toEqual({ footman: 12 });
  });

  it('without allies at departure time the march still leaves when the wait runs out', () => {
    const { s, lords } = rallySetup();
    advance(s, [CMD]);
    s.lords[lords[0]!]!.rep = 0; // fell out of favour while waiting
    let departed = false;
    for (let i = 0; i < 100 && !departed; i++) departed = advance(s, []).some((e) => e.t === 'RallyDeparted');
    expect(departed).toBe(true);
  });

  it('is deterministic', () => {
    const run = (): number => { const { s } = rallySetup(); advance(s, [CMD]); for (let i = 0; i < 2500; i++) advance(s, []); return s.reports.length * 1e6 + s.lords[Object.keys(s.lords).sort()[0]!]!.rep; };
    expect(run()).toBe(run());
  });
});
