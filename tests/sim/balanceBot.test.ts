import { describe, expect, it } from 'vitest';
import { runFirstCamp, runYear } from '../../tools/balance-sim';

describe('balance bot (M5, M7)', () => {
  it('M5: reaches Town Hall 3 with a basic army and clears a tier-1 camp through real march + combat', () => {
    const r = runFirstCamp();
    expect(r.m.th[3]).toBeDefined();
    expect(r.m.firstCampMinutes).not.toBeNull();
    expect(r.m.firstCampMinutes!).toBeGreaterThan(r.m.th[3]! - 1);
    expect(r.m.firstCampMinutes!).toBeLessThan(40);
    console.log(r.notes.join(' | '));
  }, 90_000);

  it('M7: survives a full year (80 days) at Normal: never starving for long, camps cleared, not perpetually drained', () => {
    const r = runYear();
    console.log(r.notes.join(' | '));
    expect(r.m.ticks).toBe(48000);
    expect(r.m.maxZeroFoodDays).toBeLessThanOrEqual(5);
    expect(r.m.campsCleared).toBeGreaterThanOrEqual(3);
    expect(r.m.raidsLost).toBeLessThanOrEqual(Math.max(3, r.m.raidsWon + 2));
    expect(r.m.th[4]).toBeDefined();
  }, 120_000);
});
