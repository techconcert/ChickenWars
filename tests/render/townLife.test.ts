import { describe, expect, it } from 'vitest';
import { ANIM, CIV_CAP, HAS, MAX_FORMATIONS, NPC_CAP, SOL_CAP, TASK, asleepAt, bedtime, bestTroopFor, explorerCount, fitSizes, formationSize, formationSlot, inOutskirtsBand, outskirtsSpot, pickFormationBuildings, pickTask, poseFor, population, pushOut, waketime, type TroopLite } from '../../src/render/view/townLife';

describe('town life (render-only schedule helpers)', () => {
  it('sleeps through the night window and wakes around dawn', () => {
    const bed = bedtime(0.5), wake = waketime(0.5);
    expect(asleepAt(0.25, bed, wake)).toBe(false);
    expect(asleepAt(0.75, bed, wake)).toBe(true);
    expect(asleepAt(0.99, bed, wake)).toBe(true);
    expect(asleepAt(0.0, bed, wake)).toBe(true);
    expect(asleepAt(0.1, bed, wake)).toBe(false);
  });
  it('caps the crowd at 24 and thins it with quality', () => {
    const hi = population(60, 400, 18, 'high');
    expect(hi.civ + hi.sol).toBeLessThanOrEqual(NPC_CAP);
    expect(hi.civ).toBeLessThanOrEqual(CIV_CAP);
    const lo = population(60, 400, 18, 'low');
    expect(lo.civ + lo.sol).toBeLessThan(hi.civ + hi.sol);
    expect(population(0, 0, 0, 'high')).toEqual({ civ: 0, sol: 0 });
    expect(population(3, 3, 0, 'medium').civ).toBeGreaterThanOrEqual(2);
  });
  it('only picks tasks the town offers', () => {
    for (let r = 0; r < 1; r += 0.01) {
      for (let role = 0; role < 4; role++) {
        const t = pickTask(role, 0, r);
        expect(t === TASK.wander || t === TASK.peck).toBe(true);
        const t2 = pickTask(role, HAS.pond, r);
        expect([TASK.wander, TASK.peck, TASK.water]).toContain(t2);
      }
    }
  });
  it('poses loop and stay bounded', () => {
    const o = { pitch: 0, bob: 0, fwd: 0, swing: 0, yaw: 0 };
    for (let a = 0; a <= 11; a++) {
      for (let t = 0; t < 5; t += 0.07) {
        poseFor(a, t, 1.3, o);
        expect(Math.abs(o.pitch)).toBeLessThan(1.2);
        expect(Math.abs(o.swing)).toBeLessThan(1.6);
        expect(o.fwd).toBeLessThan(0.2);
      }
    }
    const p0 = poseFor(ANIM.strike, 0.3, 0, { ...o }).pitch;
    expect(poseFor(ANIM.strike, 0.3 + (Math.PI * 2) / 5.2, 0, { ...o }).pitch).toBeCloseTo(p0, 5);
  });
  it('pushes points out of building footprints and leaves others alone', () => {
    const out = [0, 0];
    expect(pushOut(0.1, 0, [0], [0], [1], 1, 0, out)).toBe(true);
    expect(Math.hypot(out[0]!, out[1]!)).toBeCloseTo(1, 5);
    expect(pushOut(3, 3, [0], [0], [1], 1, 0, out)).toBe(false);
    expect(out).toEqual([3, 3]);
  });
  it('formation slots are distinct', () => {
    const seen = new Set<string>();
    const o = [0, 0];
    for (const kind of [0, 1, 2]) {
      seen.clear();
      for (let j = 0; j < 4; j++) { formationSlot(kind, j, 4, o); seen.add(o.map((v) => v.toFixed(2)).join(',')); }
      expect(seen.size).toBe(4);
    }
  });

  it('shows at most 3 formations, one per military building type, at the best building', () => {
    const bs = [
      { id: 'b5', type: 'barracks', level: 2 }, { id: 'b2', type: 'barracks', level: 5 }, { id: 'b1', type: 'barracks', level: 5 },
      { id: 'a1', type: 'archery_range', level: 1 }, { id: 'a2', type: 'archery_range', level: 1 },
      { id: 's1', type: 'stable', level: 0 }, { id: 's2', type: 'stable', level: 3 }, { id: 'h1', type: 'house', level: 9 },
    ];
    const picked = pickFormationBuildings(bs);
    expect(picked.length).toBeLessThanOrEqual(MAX_FORMATIONS);
    expect(picked.map((b) => b.id)).toEqual(['b1', 'a1', 's2']);
    expect(pickFormationBuildings([{ id: 'x', type: 'barracks', level: 0 }, { id: 'h', type: 'house', level: 1 }])).toEqual([]);
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, type: ['barracks', 'archery_range', 'stable'][i % 3]!, level: 1 }));
    expect(pickFormationBuildings(many).length).toBe(3);
  });
  it('picks the best unlocked troop of the building and ignores enemies', () => {
    const T = (id: string, tier: number, building: string, extra: Partial<TroopLite> = {}): TroopLite => ({ id, class: 'infantry', tier, building, minBuildingLevel: tier * 2 - 1, ...extra });
    const troops = [T('militia', 1, 'barracks'), T('footman', 2, 'barracks', { requiresTech: 't2' }), T('guardian', 3, 'barracks', { requiresTech: 't3' }),
      T('h_riot', 3, 'barracks', { role: 'enemy' }), T('bowman', 1, 'archery_range', { class: 'archer' })];
    expect(bestTroopFor('barracks', 9, troops, [])?.id).toBe('militia');
    expect(bestTroopFor('barracks', 9, troops, ['t2'])?.id).toBe('footman');
    expect(bestTroopFor('barracks', 9, troops, ['t2', 't3'])?.id).toBe('guardian');
    expect(bestTroopFor('barracks', 3, troops, ['t2', 't3'])?.id).toBe('footman'); // building level gate
    expect(bestTroopFor('archery_range', 1, troops, [])?.class).toBe('archer');
    expect(bestTroopFor('stable', 1, troops, [])).toBeNull();
  });
  it('scales formation size mildly with owned troops (2 to 6) and fits the budget', () => {
    expect(formationSize(0)).toBe(2);
    expect(formationSize(7)).toBe(3);
    expect(formationSize(10000)).toBe(6);
    expect(formationSize(10000, 3)).toBe(3);
    expect(fitSizes([6, 6, 6], 10)).toEqual([3, 3, 4]);
    expect(fitSizes([6, 6, 6], 10).reduce((a, b) => a + b, 0)).toBe(10);
    expect(Math.min(...fitSizes([6, 6, 6], 2))).toBe(2);
    expect(MAX_FORMATIONS * 6).toBeLessThanOrEqual(SOL_CAP);
  });
  it('outskirts chicks: 3 to 5, spots inside the annulus just past the border', () => {
    for (const q of ['low', 'medium', 'high'] as const) expect(explorerCount(q)).toBeGreaterThanOrEqual(3);
    expect(explorerCount('high')).toBeLessThanOrEqual(5);
    const out = [0, 0];
    for (let a = 0; a <= 1; a += 0.05) for (let b = 0; b <= 1; b += 0.1) {
      outskirtsSpot(a, b, 2, -3, 7.5, 12, out);
      const d = Math.hypot(out[0]! - 2, out[1]! + 3);
      expect(d).toBeGreaterThanOrEqual(7.5 - 1e-9);
      expect(d).toBeLessThanOrEqual(12 + 1e-9);
    }
    expect(inOutskirtsBand(4, 4)).toBe(false);
    expect(inOutskirtsBand(5, 4)).toBe(true);
    expect(inOutskirtsBand(6, 4)).toBe(true);
    expect(inOutskirtsBand(7, 4)).toBe(false);
  });
});
