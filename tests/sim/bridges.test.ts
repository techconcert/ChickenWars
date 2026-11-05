import { describe, expect, it } from 'vitest';
import { pickCapitalCell } from '@app/newGame';
import { generateTerrainLogic, toPlainLogic, F_WALKABLE } from '@gen/terrain/logic';
import { validateCommand } from '@sim/commands';
import { START_TYPES } from '@sim/data/registry';
import { createInitialState } from '@sim/init';
import { findPath, gridFor, unlockVersion, pathIsValid } from '@sim/nav';
import type { GameState } from '@sim/state';
import { advance } from '@sim/tick';
import { lockedBridgeCount, unlockBridges } from '@sim/systems/bridges';
import { makeTestBaseTerrain } from '@sim/worldgen/testLogic';

function islandsState(seed = 7): GameState {
  const def = START_TYPES['islands']!;
  const plain = toPlainLogic(generateTerrainLogic(seed, { radius: 40, startType: { id: 'islands', ...def.terrain } }));
  return createInitialState(seed, { startType: 'islands' }, {
    worldLogic: {
      radius: plain.radius, terrainHash: plain.terrainHash, capitalCell: pickCapitalCell(plain), regionOf: plain.regionOf, level: plain.level,
      biome: plain.biome, flags: plain.flags, navCost: plain.navCost,
      regions: plain.regions.map((r) => ({ ...r, dangerTier: 1, unlocked: false, boss: null, lord: null })), ramps: plain.ramps, bridges: plain.bridges,
    },
    baseTerrain: makeTestBaseTerrain(16, seed),
  });
}

/** A walkable cell that is only reachable across a locked bridge. */
function farCell(s: GameState): number {
  const g = gridFor(s.world.radius);
  let best = -1;
  for (let c = 0; c < g.count; c++) {
    if (((s.world.flags[c] ?? 0) & F_WALKABLE) === 0) continue;
    if (findPath(s.world, s.world.capitalCell, c, { allowLocked: true })) continue;
    if (findPath(s.world, s.world.capitalCell, c, { allowLocked: true, ignoreBridges: true })) best = c;
  }
  return best;
}

describe('islands bridges (D33)', () => {
  it('the islands map has bridges and they start locked', () => {
    const s = islandsState();
    expect(s.world.bridges!.length).toBeGreaterThanOrEqual(1);
    expect(s.world.bridges!.every((b) => !b.unlocked && b.cells.length > 0)).toBe(true);
    expect(lockedBridgeCount(s)).toBe(s.world.bridges!.length);
  });

  it('paths across a locked bridge are blocked even with allowLocked, and open after the Shipwright research', () => {
    const s = islandsState();
    const far = farCell(s);
    expect(far).toBeGreaterThanOrEqual(0);
    const before = unlockVersion(s.world);
    expect(findPath(s.world, s.world.capitalCell, far, { allowLocked: true })).toBeNull();
    const cmdErr = validateCommand(s, { t: 'march', hero: Object.keys(s.heroes)[0]!, troops: { militia: 1 }, target: { cell: far }, kind: 'scout' });
    expect(['bridge_locked', 'locked', 'no_troops']).toContain(cmdErr);

    s.research.active.push({ tech: 'exp_shipwright', endTick: s.tick + 1 });
    const ev = advance(s);
    ev.push(...advance(s));
    expect(ev.some((e) => e.t === 'BridgeUnlocked' && e.by === 'research')).toBe(true);
    expect(lockedBridgeCount(s)).toBe(0);
    expect(unlockVersion(s.world)).not.toBe(before);
    const p = findPath(s.world, s.world.capitalCell, far, { allowLocked: true });
    expect(p).not.toBeNull();
    expect(pathIsValid(s.world, p!, true)).toBe(true);
  });

  it('a boss kill unlocks only the bridges touching its region', () => {
    const s = islandsState();
    const first = s.world.bridges![0]!;
    const ctx = { events: [] } as never;
    const opened = unlockBridges(s, ctx, 'boss', first.regionA);
    expect(opened).toContain(first.id);
    for (const b of s.world.bridges!) expect(b.unlocked).toBe(b.regionA === first.regionA || b.regionB === first.regionA);
    // a region touching no bridge opens nothing
    const lonely = s.world.regions.find((r) => !s.world.bridges!.some((b) => b.regionA === r.id || b.regionB === r.id));
    if (lonely) expect(unlockBridges(s, ctx, 'boss', lonely.id)).toEqual([]);
  });

});
