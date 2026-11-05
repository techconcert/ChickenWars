import { describe, expect, it } from 'vitest';
import { hashState } from '@sim/save/hash';
import { advance, catchUp } from '@sim/tick';
import { makeState } from '../helpers/makeState';
import { ripeState } from './raidsSetup';

describe('offline catch-up (D12)', () => {
  it('catching up N ticks equals running N ticks in safe mode', () => {
    const a = makeState();
    const b = makeState();
    catchUp(a, 1300);
    b.flags.safeMode = true;
    for (let i = 0; i < 1300; i++) advance(b, []);
    b.flags.safeMode = false;
    expect(hashState(a)).toBe(hashState(b));
    expect(a.tick).toBe(1300);
  });

  it('with no raid in sight, catch-up equals a normal run (no seeded events fall in the window)', () => {
    const a = makeState();
    const b = makeState();
    catchUp(a, 1150);
    for (let i = 0; i < 1150; i++) advance(b, []);
    expect(hashState(a)).toBe(hashState(b));
  });

  it('a town that would be raided is left alone while offline, and camps stop growing at their tier cap', () => {
    const live = ripeState();
    const away = ripeState();
    const liveEvents = [];
    for (let i = 0; i < 4000; i++) liveEvents.push(...advance(live.s, []));
    expect(liveEvents.some((e) => e.t === 'RaidLaunched')).toBe(true);
    const awayEvents = catchUp(away.s, 4000);
    expect(awayEvents.some((e) => e.t === 'RaidLaunched' || e.t === 'RaidWarning' || e.t === 'RaidResolved')).toBe(false);
    expect(Object.keys(away.s.raids)).toHaveLength(0);
    expect(away.s.flags.safeMode).toBe(false);
    expect(away.s.stats.battlesLost).toBe(0);
    // Camps never exceed the tier cap, however long the player is away.
    catchUp(away.s, 20000);
    expect(away.camp.strength).toBeLessThanOrEqual(600);
  });

  it('raids already on the road turn back when the game goes offline', () => {
    const { s } = ripeState();
    let launched = false;
    for (let i = 0; i < 4000 && !launched; i++) launched = advance(s, []).some((e) => e.t === 'RaidLaunched');
    expect(launched).toBe(true);
    const ev = catchUp(s, 5);
    expect(Object.keys(s.raids)).toHaveLength(0);
    expect(ev.some((e) => e.t === 'RaidResolved' && e.won)).toBe(true);
    expect(s.reports).toHaveLength(0);
  });
});

describe('offline fast-forward (D47)', () => {
  it('a full 8 hour absence on a busy town finishes quickly and keeps the state sane', async () => {
    const { richState } = await import('./richState');
    const s = richState(7);
    s.city.buildings[s.city.townHall]!.level = 6;
    const t0 = Date.now();
    const ev = catchUp(s, 288000);
    const ms = Date.now() - t0;
    expect(ms).toBeLessThan(4000);
    expect(s.tick).toBe(288000);
    expect(s.flags.safeMode).toBe(false);
    expect(Object.keys(s.marches)).toHaveLength(0);
    expect(Object.keys(s.raids)).toHaveLength(0);
    for (const r of ['food', 'wood', 'stone', 'gold'] as const) expect(Number.isFinite(s.resources[r]) && s.resources[r] >= 0).toBe(true);
    expect(ev.some((e) => e.t === 'RaidLaunched')).toBe(false);
    expect(s.season.day).toBeGreaterThan(400);
  });

  it('approximates the exact simulation: after a long absence the stock is within 25% of the tick-by-tick result', async () => {
    const { richState } = await import('./richState');
    const a = richState(11), b = richState(11);
    a.city.buildings[a.city.townHall]!.level = 5;
    b.city.buildings[b.city.townHall]!.level = 5;
    for (const r of ['food', 'wood', 'stone', 'gold'] as const) { a.resources[r] = 100; b.resources[r] = 100; }
    catchUp(a, 12000);
    b.flags.safeMode = true;
    for (let i = 0; i < 12000; i++) advance(b, []);
    for (const r of ['wood', 'stone'] as const) {
      const ref = Math.max(1, b.resources[r]);
      expect(Math.abs(a.resources[r] - ref) / ref).toBeLessThan(0.25);
    }
    expect(a.tick).toBe(b.tick);
  });
});
