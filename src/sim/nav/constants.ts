// Documented march / nav / fog constants (docs/systems/marches-and-nav.md, world.md).
/** A troop with speed 10 crosses one cell in 100 ticks (10 s). Faster troops divide this. */
export const MARCH_TICKS_PER_CELL_AT_SPEED10 = 100;
/** Progress units per cell step (MarchState.progress runs 0..1000 per step). */
export const PROGRESS_PER_STEP = 1000;
/** Level change across a ramp costs this much more (path cost and march slowdown). */
export const LEVEL_CHANGE_FACTOR = 1.5;
/** Terrain slowdown per navCost point above 1 (speed divisor = 1 + this * (cost-1), capped). */
export const TERRAIN_SLOW_PER_COST = 0.05;
export const TERRAIN_SLOW_MAX = 1.5;
/** Resources gathered per troop per minute at gatherRate 1.0, before hero/season/difficulty multipliers. */
export const GATHER_PER_TROOP_PER_MINUTE = 1;
/** Food (minutes of troop upkeep) packed as supply for a march. */
export const SUPPLY_MINUTES = 2;
/** Node regrowth: after respawn at 50%, a node regains max amount over this many ticks. */
export const NODE_REGROW_TICKS = 1200;
export const NODE_RESPAWN_FRACTION = 0.5;
/** Fog of war. */
export const FOG_INTERVAL_TICKS = 10;
export const CAPITAL_VISION = 6;
export const MARCH_VISION = 4;
export const SCOUT_VISION = 7;
/** Hex radius around a scout's arrival cell in which ruins and caches are explored. */
export const SCOUT_EXPLORE_RADIUS = 1;
/** Path cache size. */
export const PATH_CACHE_SIZE = 64;
/** Worldgen placement. */
export const POI_MIN_DISTANCE = 3;
export const NODE_MIN_DISTANCE = 2;
export const CAPITAL_CLEAR_RADIUS = 4;
export const CAPITAL_GUARANTEE_RADIUS = 12;
/** World events expire (ignored) after this many ticks. */
export const EVENT_EXPIRE_TICKS = 1200;
