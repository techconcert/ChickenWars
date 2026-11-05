import type { HeightField } from './fieldTypes';
import { placeProps, placeTrees } from './placeFlora';
import { placeRocks } from './placeRocks';
import type { Placements } from './placeTypes';

export * from './placeTypes';
export { placeRocks } from './placeRocks';
export { placeProps, placeTrees } from './placeFlora';

export interface PlacementOptions {
  /** number of rock mesh variants the renderer has (default 8) */
  rockVariants?: number;
}

/** All pure placement lists for a height field. Plain arrays of objects; the renderer builds instanced meshes. */
export function generatePlacements(F: HeightField, opts: PlacementOptions = {}): Placements {
  const { rocks, contourLength } = placeRocks(F, opts.rockVariants ?? 8);
  const trees = placeTrees(F);
  const { tufts, stones, reeds } = placeProps(F);
  return { rocks, trees, tufts, stones, reeds, contourLength };
}
