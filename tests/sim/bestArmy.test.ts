import { describe, expect, it } from 'vitest';
import { bestAttackTroops } from '../../src/ui/marchInfo';
import { addCamp } from './raidsSetup';
import { makeState } from '../helpers/makeState';

function setup(enemy: { troop: string; count: number }[]) {
  const s = makeState();
  for (const id of Object.keys(s.world.pois)) if (s.world.pois[id]!.kind === 'bandit_camp') delete s.world.pois[id];
  const camp = addCamp(s, 'c1', 1, 120, 5);
  camp.troops = enemy;
  s.troops.militia = { healthy: 30, wounded: 0 };
  s.troops.bowman = { healthy: 30, wounded: 0 };
  s.troops.rider = { healthy: 30, wounded: 0 };
  return { s, camp };
}
const have = (s: ReturnType<typeof makeState>) => (id: string): number => s.troops[id]?.healthy ?? 0;
const ids = ['militia', 'bowman', 'rider'];

describe('best army for a camp', () => {
  it('brings cavalry against archers and archers against infantry', () => {
    const a = setup([{ troop: 'bowman', count: 40 }]);
    const vsArchers = bestAttackTroops(a.s, 'c1', 'aldric', ids, have(a.s), 30);
    expect(vsArchers.rider ?? 0).toBeGreaterThan(vsArchers.militia ?? 0);
    const b = setup([{ troop: 'militia', count: 40 }]);
    const vsInfantry = bestAttackTroops(b.s, 'c1', 'aldric', ids, have(b.s), 30);
    expect(vsInfantry.bowman ?? 0).toBeGreaterThanOrEqual(vsInfantry.rider ?? 0);
    const c = setup([{ troop: 'rider', count: 40 }]);
    const vsCav = bestAttackTroops(c.s, 'c1', 'aldric', ids, have(c.s), 30);
    expect(vsCav.militia ?? 0).toBeGreaterThan(vsCav.bowman ?? 0);
  });

  it('never exceeds the lead limit or the troops at home', () => {
    const a = setup([{ troop: 'militia', count: 20 }]);
    const t = bestAttackTroops(a.s, 'c1', 'aldric', ids, have(a.s), 25);
    expect(Object.values(t).reduce((x, y) => x + y, 0)).toBeLessThanOrEqual(25);
    for (const k of Object.keys(t)) expect(t[k]!).toBeLessThanOrEqual(30);
  });
});
