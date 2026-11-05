export interface FieldRamp {
  id: number;
  /** capsule centre (border midpoint), unit axis pointing low -> high */
  px: number;
  pz: number;
  ax: number;
  az: number;
  /** soft width (cliff-profile width inside the capsule) */
  w: number;
  /** capsule radius */
  R: number;
  /** capsule half lengths towards the low / high side (high side extends onto thin plateaus) */
  halfLo: number;
  halfHi: number;
  upL: number;
  dnL: number;
  maxSlope: number;
  rise: number;
  ok: boolean;
  /** height at the centre */
  y: number;
  candIdx: number;
  /** true when the upper plateau was too thin to be reached within the cap */
  thin: boolean;
  rerouted: boolean;
  lengthened: boolean;
  widened: boolean;
}

export interface FieldStats {
  rampCount: number;
  maxSlope: number;
  slopes: number[];
  okCount: number;
  widened: number;
  rerouted: number;
  lengthened: number;
  thinPlateaus: number;
  /** ramps whose centreline climbs less than 1.0 units (cosmetic: thin plateau, informational) */
  lowRise: number;
  genMs: number;
  samples: number;
}

export interface HeightField {
  x0: number;
  z0: number;
  /** sample spacing in world units */
  h: number;
  GW: number;
  GH: number;
  n: number;
  /** terrain height per sample */
  H: Float32Array;
  /** per-level signed distance fields (positive inside level >= k) */
  sdfs: Float32Array[];
  maxLv: number;
  /** logic cell id per sample (domain-warped lookup) */
  cellG: Int32Array;
  /** biome id per sample (biome blend input; 0 beach/sea) */
  bioG: Uint8Array;
  /** level per sample, -1 sea */
  Lg: Int8Array;
  /** ramp mask 0..1 */
  rampM: Float32Array;
  /** ramp side-bank mask 0..1 (darker banks next to ramps) */
  rampSideM: Float32Array;
  /** dirt path mask 0..1 */
  pathM: Float32Array;
  /** lake/river shore mask 0..1 */
  lakeNear: Float32Array;
  /** water surface height per sample (SEA where no lake/river) */
  wl: Float32Array;
  /** low-frequency noise inputs for the mesher */
  bnG: Float32Array;
  hnG: Float32Array;
  ramps: FieldRamp[];
  stats: FieldStats;
  seed: number;
}
