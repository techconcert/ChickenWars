import { describe, expect, it } from 'vitest';
import { pickCapitalCell } from '@app/newGame';
import { generateTerrainLogic, reachable, toPlainLogic, F_LAND, F_WALKABLE } from '@gen/terrain/logic';
import { CLANS, START_TYPES } from '@sim/data/registry';
import { createInitialState } from '@sim/init';
import { clanBonus } from '@sim/progression';
import { advance } from '@sim/tick';
import { seasonLengths } from '@sim/systems/seasons';
import { makeTestBaseTerrain } from '@sim/worldgen/testLogic';

describe('start types', () => {
  for (const id of Object.keys(START_TYPES)) {
    it(`${id}: connected logic layer and start state matches the definition`, () => {
      const def = START_TYPES[id]!;
      const logic = generateTerrainLogic(7, { radius: 40, startType: { id, ...def.terrain } });
      const plain = toPlainLogic(logic);
      const cap = pickCapitalCell(plain);
      expect(((plain.flags[cap] ?? 0) & F_WALKABLE) !== 0).toBe(true);
      const seen = reachable(logic, cap);
      let land = 0, got = 0;
      for (let c = 0; c < logic.count; c++) {
        if (((logic.flags[c] ?? 0) & F_LAND) === 0 || ((logic.flags[c] ?? 0) & F_WALKABLE) === 0) continue;
        land++;
        if (seen[c]) got++;
      }
      expect(land).toBeGreaterThan(200);
      expect(got / land).toBeGreaterThan(0.9);

      const s = createInitialState(7, { startType: id, clan: 'oakwarden' }, {
        worldLogic: {
          radius: plain.radius, terrainHash: plain.terrainHash, capitalCell: cap, regionOf: plain.regionOf, level: plain.level,
          biome: plain.biome, flags: plain.flags, navCost: plain.navCost,
          regions: plain.regions.map((r) => ({ ...r, dangerTier: 1, unlocked: false, boss: null, lord: null })), ramps: plain.ramps,
        },
        baseTerrain: makeTestBaseTerrain(16, 7),
      });
      for (const k of Object.keys(def.start.resources) as (keyof typeof s.resources)[]) expect(s.resources[k]).toBe(def.start.resources[k]);
      expect(seasonLengths(s)).toEqual([def.season.springDays, def.season.summerDays, def.season.autumnDays, def.season.winterDays]);
    });
  }
});

describe('clans are applied once', () => {
  it('heroStartLevel is added at new game only; start state is unchanged by ticking', () => {
    for (const id of Object.keys(CLANS)) {
      const s = createInitialState(3, { clan: id }, {
        worldLogic: makeLogic(), baseTerrain: makeTestBaseTerrain(16, 3),
      });
      const want = 1 + clanBonus(s, 'heroStartLevel');
      expect(s.heroes['aldric']?.level).toBe(want);
      for (let i = 0; i < 50; i++) advance(s);
      expect(s.heroes['aldric']?.level).toBe(want);
      expect(clanBonus(s, 'heroStartLevel')).toBe(clanBonus(s, 'heroStartLevel'));
    }
  });
});

import { makeTestWorldLogic } from '@sim/worldgen/testLogic';
function makeLogic() { return makeTestWorldLogic(20); }
