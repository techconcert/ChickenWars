import { describe, expect, it } from 'vitest';
import { clipReason } from '@gen/terrain/steep';
import { makeHexGrid } from '@gen/hex';
import { buildWorldLogic } from '../../src/app/newGame';
import { createInitialState } from '@sim/init';
import { makeTestBaseTerrain } from '@sim/worldgen/testLogic';

const WORLDS = 200;

describe(`world markers vs terrain (${WORLDS} worlds)`, () => {
  it('no marker sinks into a slope or hides behind a ledge from any side', () => {
    const bad: string[] = [];
    let markers = 0;
    let worlds = 0;
    for (let seed = 1; seed <= WORLDS; seed++) {
      // same field density as the renderer (0.3), checked against the markers that really ended up in the state
      const { field, worldLogic: wl } = buildWorldLogic(seed, 40, 'river_valley');
      const s = createInitialState(seed, {}, { worldLogic: wl as never, baseTerrain: makeTestBaseTerrain(16, 1) });
      const g = makeHexGrid(40);
      const xz = (c: number): [number, number] => [g.x[c] ?? 0, g.z[c] ?? 0];
      const cells: [string, number][] = [['capital', s.world.capitalCell]];
      for (const p of Object.values(s.world.pois)) cells.push([`poi ${p.id}`, p.cell]);
      for (const n of Object.values(s.world.nodes)) cells.push([`node ${n.id}`, n.cell]);
      worlds++;
      for (const [what, c] of cells) {
        markers++;
        const [x, z] = xz(c);
        const why = clipReason(field, x, z);
        if (why) bad.push(`seed ${seed} ${what} cell ${c}: ${why}`);
      }
    }
    console.log(`checked ${markers} markers in ${worlds} worlds, ${bad.length} clipped`);
    if (bad.length) console.log(bad.slice(0, 25).join('\n'));
    expect(bad).toEqual([]);
  }, 900000);
});
