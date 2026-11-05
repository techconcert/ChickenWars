import { describe, expect, it } from 'vitest';
import { runOpening, runScriptedOpening, TH3_MAX_MINUTES, TH3_MIN_MINUTES } from '../../tools/balance-sim';

// Generous timeouts: these run a few thousand ticks and must not flake when the machine is busy.
describe('balance bot opening (M3)', () => {
  it('the general bot reaches Town Hall 3 in 8 to 12 minutes at 1x (seed 1337, Normal)', () => {
    const r = runOpening();
    expect(r.th2Minutes).not.toBeNull();
    expect(r.th3Minutes).not.toBeNull();
    expect(r.th3Minutes!).toBeGreaterThanOrEqual(TH3_MIN_MINUTES);
    expect(r.th3Minutes!).toBeLessThanOrEqual(TH3_MAX_MINUTES);
    expect(r.th2Minutes!).toBeLessThan(r.th3Minutes!);
  }, 60_000);

  it('is deterministic', () => {
    expect(runOpening().th3Minutes).toBe(runOpening().th3Minutes);
  }, 60_000);

  it('the scripted economy-only opening still reaches TH3 (faster, since it ignores troops and raids)', () => {
    const r = runScriptedOpening();
    expect(r.th3Minutes).not.toBeNull();
    expect(r.th3Minutes!).toBeLessThan(TH3_MAX_MINUTES);
  }, 60_000);
});
