import { describe, expect, it } from 'vitest';
import { createInitialState } from '@sim/init';
import { WORLD } from '@sim/data/registry';
import { cellDistance, findPath, gridFor } from '@sim/nav';
import { hashState } from '@sim/save/hash';
import type { GameState } from '@sim/state';
import { campLevel } from '@sim/worldgen/spawn';
import { richState } from './richState';
import { makeTestBaseTerrain, makeTestWorldLogic } from '@sim/worldgen/testLogic';

function flatState(seed = 7): GameState {
  return createInitialState(seed, {}, { worldLogic: makeTestWorldLogic(20), baseTerrain: makeTestBaseTerrain(16, seed) });
}
const overlayHash = (s: GameState): number => hashState({ n: s.world.nodes, p: s.world.pois, r: s.world.regions, l: s.lords, f: s.world.fog });

const worlds: [string, () => GameState][] = [['rich', () => richState(7)], ['rich-b', () => richState(99)], ['flat', () => flatState(3)]];

describe('worldgen overlay', () => {
  it('is deterministic per seed and differs between seeds', () => {
    expect(overlayHash(richState(7))).toBe(overlayHash(richState(7)));
    expect(overlayHash(richState(7))).not.toBe(overlayHash(richState(8)));
    expect(overlayHash(flatState(3))).toBe(overlayHash(flatState(3)));
  });

  it('assigns danger tiers by walkable region distance; home unlocked, tier 3+ locked', () => {
    const s = richState();
    const t = s.world.regions.map((r) => r.dangerTier);
    expect(t).toEqual([1, 2, 2, 3, 3, 2, 2]);
    expect(s.world.regions.map((r) => r.unlocked)).toEqual([true, true, true, false, false, true, true]);
  });

  it.each(worlds)('%s: every POI and node is reachable from the capital via nav (locks ignored)', (_n, mk) => {
    const s = mk();
    const cap = s.world.capitalCell;
    expect(Object.keys(s.world.pois).length).toBeGreaterThan(5);
    expect(Object.keys(s.world.nodes).length).toBeGreaterThan(4);
    for (const p of Object.values(s.world.pois)) expect(findPath(s.world, cap, p.cell, { allowLocked: true }), p.id).not.toBeNull();
    for (const n of Object.values(s.world.nodes)) expect(findPath(s.world, cap, n.cell, { allowLocked: true }), n.id).not.toBeNull();
  });

  it.each(worlds)('%s: placement rules (flags, spacing, capital clear radius)', (_n, mk) => {
    const s = mk();
    const g = gridFor(s.world.radius);
    const bad = 1 << 3 | 1 << 4 | 1 << 5;
    const pois = Object.values(s.world.pois);
    for (const p of pois) {
      expect(s.world.flags[p.cell]! & bad, `${p.id} on ramp/lake/coast`).toBe(0);
      expect(s.world.navCost[p.cell]).toBeGreaterThan(0);
      if (['bandit_camp', 'lair', 'boss'].includes(p.kind)) expect(cellDistance(g, s.world.capitalCell, p.cell)).toBeGreaterThan(4);
      expect(p.region).toBe(s.world.regionOf[p.cell]);
    }
    for (let i = 0; i < pois.length; i++) for (let j = i + 1; j < pois.length; j++) {
      expect(cellDistance(g, pois[i]!.cell, pois[j]!.cell)).toBeGreaterThanOrEqual(3);
    }
    for (const n of Object.values(s.world.nodes)) {
      expect(s.world.flags[n.cell]! & bad).toBe(0);
      expect(pois.some((p) => p.cell === n.cell)).toBe(false);
    }
  });

  it.each(worlds)('%s: vertical slice guarantee near the capital', (_n, mk) => {
    const s = mk();
    const g = gridFor(s.world.radius);
    const camps = Object.values(s.world.pois).filter((p) => p.kind === 'bandit_camp' && cellDistance(g, s.world.capitalCell, p.cell) <= 12);
    expect(camps.length).toBeGreaterThanOrEqual(2);
    expect(camps.filter((c) => c.tier === 1).length).toBeGreaterThanOrEqual(2);
    const nodes = Object.values(s.world.nodes).filter((n) => cellDistance(g, s.world.capitalCell, n.cell) <= 12);
    expect(nodes.length).toBeGreaterThanOrEqual(4);
    expect(new Set(nodes.map((n) => n.resource)).size).toBeGreaterThanOrEqual(2);
  });

  it('one boss per region from tier 2, none at home; region.boss points at it', () => {
    for (const [, mk] of worlds) {
      const s = mk();
      for (const r of s.world.regions) {
        const bosses = Object.values(s.world.pois).filter((p) => p.kind === 'boss' && p.region === r.id);
        expect(bosses.length).toBe(r.dangerTier >= 2 ? 1 : 0);
        if (bosses[0]) {
          expect(r.boss).toBe(bosses[0].id);
          expect(bosses[0].bossId).toBe(WORLD.bosses.find((b) => b.tier === Math.min(6, r.dangerTier))!.id);
          expect(bosses[0].troops.length).toBeGreaterThan(0);
        } else expect(r.boss).toBeNull();
      }
    }
  });

  it('POI levels follow the contract (camps by strength, lairs and bosses tier*5, max 25)', () => {
    const s = richState();
    for (const p of Object.values(s.world.pois)) {
      if (p.kind === 'bandit_camp') {
        expect(p.level).toBeGreaterThanOrEqual((p.tier - 1) * 5 + 1);
        expect(p.level).toBeLessThanOrEqual(p.tier * 5);
        expect(p.troops.length).toBeGreaterThan(0);
      } else if (p.kind === 'lair' || p.kind === 'boss') {
        expect(p.level).toBe(Math.min(25, p.tier * 5));
      }
      expect(p.level).toBeLessThanOrEqual(25);
    }
    const tier1 = Object.values(s.world.pois).filter((p) => p.kind === 'bandit_camp' && p.tier === 1);
    expect(tier1.every((c) => c.level === 1 && c.strength === 100)).toBe(true);
    expect(campLevel(1, 220)).toBe(5);
    expect(campLevel(3, 900)).toBe(11);
    expect(campLevel(2, 600 * 1.25, 1.25)).toBe(10);
  });

  it('hard difficulty scales camp strength', () => {
    const s = richState(7, { difficulty: 'hard' });
    const c = Object.values(s.world.pois).find((p) => p.kind === 'bandit_camp' && p.tier === 1)!;
    expect(c.strength).toBe(125);
    expect(c.level).toBe(1);
  });

  it('villages get unique lords with rep 0', () => {
    const s = richState();
    const villages = Object.values(s.world.pois).filter((p) => p.kind === 'village');
    expect(villages.length).toBeGreaterThanOrEqual(5);
    const lords = villages.map((v) => v.lordId);
    expect(new Set(lords).size).toBe(lords.length);
    for (const v of villages) {
      const l = s.lords[v.lordId!]!;
      expect(l.poi).toBe(v.id);
      expect(l.rep).toBe(0);
    }
    expect(s.world.regions[0]!.lord).toBe('lord_hale');
  });

  it('nodes: biome rules, ember only from tier 3, amounts within tier band', () => {
    const s = richState();
    const names = ['beach', 'meadow', 'forest', 'highland', 'snow'];
    for (const n of Object.values(s.world.nodes)) {
      const def = WORLD.nodeTypes.find((t) => t.id === n.type)!;
      expect(def.biomes).toContain(names[s.world.biome[n.cell]!]);
      expect(n.resource).toBe(def.resource);
      if (n.type === 'emberseam') expect(n.tier).toBeGreaterThanOrEqual(3);
      const base = def.amountByTier[n.tier - 1]!;
      expect(n.amount).toBe(n.maxAmount);
      expect(n.maxAmount).toBeGreaterThanOrEqual(Math.round(base * 0.9));
      expect(n.maxAmount).toBeLessThanOrEqual(Math.round(base * 1.1));
      expect(n.gatherer).toBeNull();
    }
    expect(Object.values(s.world.nodes).some((n) => n.type === 'emberseam')).toBe(true);
  });

  it('initial fog shows the capital surroundings only', () => {
    const s = richState();
    const g = gridFor(s.world.radius);
    expect(s.world.fog[s.world.capitalCell]).toBe(2);
    const far = Array.from({ length: g.count }, (_, i) => i).filter((c) => cellDistance(g, s.world.capitalCell, c) > 10);
    expect(far.every((c) => s.world.fog[c] === 0)).toBe(true);
  });
});
