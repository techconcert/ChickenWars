export interface RockPlacement {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  /** orientation quaternion (local X = contour tangent, Z = outward) */
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  /** rock mesh variant index in [0, rockVariants) */
  variant: number;
  tint: number;
  kind: 'cliff' | 'boulder' | 'ramp';
}

export interface TreePlacement {
  x: number;
  y: number;
  z: number;
  /** mesh variant: 0-2 pine, 3-5 oak, 8-9 snowy pine (prototype tree types) */
  variant: number;
  scale: number;
  rot: number;
  tint: number;
}

export interface PropPlacement {
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
  tint: number;
}

export interface Placements {
  rocks: RockPlacement[];
  trees: TreePlacement[];
  tufts: PropPlacement[];
  stones: PropPlacement[];
  reeds: PropPlacement[];
  contourLength: number;
}
