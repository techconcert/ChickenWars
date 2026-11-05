// Documented raid constants (docs/systems/bandits.md). Tunable numbers live in data/balance.json (`raids`, `raidRange`).
/** Power a watchtower adds per point of its `atk` when deciding whether the city is "weak". */
export const TOWER_POWER_PER_ATK = 4;
/** Wall and tower hit points count as hp / this much power. */
export const DEFENCE_HP_DIV = 10;
/** At most this many raids are in flight at once (keeps the player able to answer). */
export const MAX_ACTIVE_RAIDS = 2;
/** Damaged walls and towers defend at this percent of their value. */
export const DAMAGED_PCT = 50;
/** Heroes at home count as atk + def + hp / this much power. */
export const HERO_POWER_HP_DIV = 10;
/** Region key prefix of the sticky "the player has cleared a camp here" counters (quests.counters). */
export const REGION_CLEARED_PREFIX = 'regionCleared_';
