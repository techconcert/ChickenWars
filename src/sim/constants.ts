// Documented sim constants. Balance numbers live in data/*.json, not here.
export const TICKS_PER_SECOND = 10;
export const TICKS_PER_MINUTE = TICKS_PER_SECOND * 60;
export const DAY_TICKS = 600;
export const SEASON_DAYS = 20;
export const YEAR_DAYS = 80;
export const OFFLINE_CAP_TICKS = 288000; // 8 h x 3600 x 10
export const OFFLINE_CHUNK_TICKS = 600;
export const MAX_SPEED = 4;
export const GENERATOR_VERSION = 1; // bump on any change to src/gen logic layer
export const SAVE_VERSION = 1;
export const LOG_LIMIT = 200;
export const REPORT_LIMIT = 20;
/** Fixed-point scale for production accumulators (units x 1000). */
export const FP = 1000;

export const RESOURCE_IDS = ['food', 'wood', 'stone', 'gold', 'ember'] as const;
export const SEASON_IDS = ['spring', 'summer', 'autumn', 'winter'] as const;
export const SPEEDS = [0, 1, 2, 4] as const;
