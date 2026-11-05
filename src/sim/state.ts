// GameState: authoritative shape (docs/07-build-contract.md section 4). JSON-safe only.
import type { GameEvent } from './events';

export type ResourceId = 'food' | 'wood' | 'stone' | 'gold' | 'ember';
export type Res = Partial<Record<ResourceId, number>>;
export type Slot = 'weapon' | 'armour' | 'banner' | 'trinket';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Speed = 0 | 1 | 2 | 4;

export interface GameOptions { size: 'small' | 'standard'; difficulty: Difficulty; startType: string; clan: string }

export interface Stack { troop: string; count: number }

/** Queue entry. For a new building, the instance exists at level 0 until the job completes. */
export interface BuildJob { id: string; building: string; targetLevel: number; startTick: number | null; endTick: number | null; ticks: number; cost: Res }
export interface TrainJob { id: string; building: string; troop: string; count: number; startTick: number | null; endTick: number | null; cost: Res }

export interface BuildingInstance { id: string; type: string; cell: number; level: number; damaged: boolean }
export interface CityState {
  radius: number;
  terrain: number[]; // 0 grass, 1 forest, 2 rock, 3 water, 4 cliff
  buildings: Record<string, BuildingInstance>;
  queue: BuildJob[];
  townHall: string;
  market: Record<string, number>;
  /** Trading Post auto-trade settings: target stock mix (percent weights) and the last completed trade. Optional for old saves. */
  trade?: { on: boolean; weights: { food: number; wood: number; stone: number; gold: number }; last?: { tick: number; lord: string; give: Res; get: Res } };
}

export interface RegionState {
  id: number; biome: number; level: number; centroidCell: number; cells: number;
  neighbours: number[]; dangerTier: number; unlocked: boolean; boss: string | null; lord: string | null;
}
export interface RampState { id: number; regionA: number; regionB: number; cells: number[] }
export interface NodeState {
  id: string; type: string; resource: ResourceId; cell: number; region: number; tier: number;
  amount: number; maxAmount: number; respawnAt: number | null; gatherer: string | null; blockedUntil: number;
}
export type PoiKind = 'bandit_camp' | 'lair' | 'boss' | 'ruin' | 'village' | 'shrine' | 'cache';
export interface PoiState {
  id: string; kind: PoiKind; cell: number; region: number; tier: number; level: number; active: boolean;
  troops: Stack[]; strength: number; respawnAt: number | null; raidReadyAt: number;
  bossId?: string; lordId?: string; explored?: boolean;
}
/** Sea bridge between two islands (Islands start type). Cells are walkable only once `unlocked` (boss kill next to it or the Shipwright research). */
export interface BridgeState { id: number; regionA: number; regionB: number; cells: number[]; unlocked: boolean }
export interface WorldState {
  radius: number; terrainHash: number; capitalCell: number;
  regionOf: number[]; level: number[]; biome: number[]; flags: number[]; navCost: number[];
  regions: RegionState[]; ramps: RampState[];
  /** Present only on maps that have bridges (Islands). Missing = none. */
  bridges?: BridgeState[];
  fog: number[]; // 0 unexplored, 1 explored, 2 visible
  nodes: Record<string, NodeState>; pois: Record<string, PoiState>;
}

export type MarchKind = 'gather' | 'attack' | 'scout' | 'garrison' | 'rally' | 'return';
export type MarchPhase = 'moving' | 'gathering' | 'fighting' | 'returning' | 'done';
/** `auto`: a random scout that keeps choosing unexplored places by itself (scout kind only). */
export interface Target { cell?: number; poi?: string; node?: string; lord?: string; auto?: boolean }
export interface MarchState {
  id: string; hero: string; troops: Record<string, number>; kind: MarchKind; target: Target;
  path: number[]; step: number; progress: number; // 0..1000
  state: MarchPhase; carried: Res; supply: number; startedAt: number; gatherEndsAt?: number;
  /** gather fixed remainder (resource units, fractional) carried between ticks */
  gatherAcc?: number;
  rally?: string; report?: number;
  /** Random scout: how many destinations it has picked so far. */
  legs?: number;
  /** Set once the ambush roll for the current gathering stop was made. */
  ambushChecked?: boolean;
  /** Wounded troops per troop id earned in battle; marches adds them to the home pool when the march returns. */
  wounded?: Record<string, number>;
}

export interface HeroState {
  id: string; level: number; xp: number; talents: Record<string, number>;
  equipment: Record<Slot, string | null>; march: string | null; skillRank: number;
}
export interface ItemInstance { id: string; def: string; upgrade: number }

export interface LordRequest {
  id: string; kind: string; data: Record<string, number | string>; expiresAt: number; urgent: boolean;
  /** requests.json template id, tick posted, whether the player accepted it (all optional for old saves). */
  template?: string; postedAt?: number; accepted?: boolean;
}
export interface LordState {
  id: string; poi: string; rep: number; requests: LordRequest[];
  giftDay: number; giftsToday: number; refusedStreak: number; tradeDay: number;
  /** Trades done on `tradeDay` (limit per stage), tick the next request is due, stage last seen (for stage-up perks). */
  tradesToday?: number; nextRequestAt?: number; stageSeen?: string;
}
export interface RallyState {
  id: string; march: string; target: string; waitUntil: number; lords: string[]; arrived: string[];
  /** Tick each invited lord's army reaches the capital; true once the march left the capital. */
  arriveAt?: Record<string, number>; departed?: boolean;
  /** Battle power per participant ('player' and lord ids), recorded when the battle starts (loot split). */
  contrib?: Record<string, number>;
}
export interface RaidState {
  id: string; camp: string; path: number[]; arriveAt: number; strength: number; troops: Stack[];
  /** Tick the RaidWarning fires and whether it already did; tick the raid launched. */
  warnAt?: number; warned?: boolean; launchedAt?: number;
}

export interface RoundSummary { n: number; damageA: number; damageB: number; lossesA: number; lossesB: number }
export interface BattleReport {
  id: number; tick: number; attackerName: string; defenderName: string; target: string | null;
  winner: 'attacker' | 'defender'; rounds: RoundSummary[];
  casualtiesA: Record<string, number>; casualtiesB: Record<string, number>; woundedA: Record<string, number>;
  loot: Res; items: string[]; heroXp: number;
  /** Raid/ambush extras: kind, defenders' wounded and damaged building ids. */
  kind?: 'march' | 'raid' | 'ambush'; woundedB?: Record<string, number>; damaged?: string[];
  rageEvents: { round: number; side: 'A' | 'B'; skill: string }[];
}

export interface GameState {
  version: number; seed: number; tick: number; rng: number; nextId: number;
  options: GameOptions;
  resources: Record<ResourceId, number>;
  accum: Record<ResourceId, number>;
  city: CityState; world: WorldState;
  troops: Record<string, { healthy: number; wounded: number }>;
  training: TrainJob[];
  heroes: Record<string, HeroState>; inventory: Record<string, ItemInstance>;
  tavern: { candidates: string[]; refreshAt: number };
  marches: Record<string, MarchState>; raids: Record<string, RaidState>;
  research: { done: string[]; active: { tech: string; endTick: number }[] };
  quests: {
    active: string | null; stepProgress: number[]; completed: string[]; counters: Record<string, number>;
    /** Per-quest counter baselines (delta steps count from quest start); created lazily by the quests system. */
    base?: Record<string, number[]>;
    /** Active side (triggered) quests: id -> step progress. */
    side?: Record<string, number[]>;
    /** Bounty board: ids already offered (never repeated), expiry tick per active bounty, completed count, next refill tick. */
    board?: { seen: string[]; due: Record<string, number>; done: number; nextAt: number };
  };
  season: { index: 0 | 1 | 2 | 3; dayOfSeason: number; year: number; day: number };
  lords: Record<string, LordState>; rallies: Record<string, RallyState>;
  pendingEvent: { id: string; expiresAt: number } | null;
  /** Ids of the most recent random events (never offered again until they fall out of this list). Optional for old saves. */
  eventSeen?: string[];
  buffs: { stat: string; pct: number; until: number }[];
  reports: BattleReport[];
  log: GameEvent[];
  chronicle: { tick: number; text: string }[];
  stats: { battlesWon: number; battlesLost: number; gathered: number; campsCleared: number; bossesKilled: number };
  flags: { won: boolean; sandbox: boolean; safeMode: boolean; /** set once the debug grant button was used */ cheated?: boolean };
  /** Infirmary healing remainder (x1000 troops); created lazily by the military system. */
  healAccum?: number;
}

/** Plain-array logic layer handed to createInitialState (produced by gen or makeTestWorldLogic). */
export interface WorldLogicInput {
  radius: number; terrainHash: number; capitalCell: number;
  regionOf: number[]; level: number[]; biome: number[]; flags: number[]; navCost: number[];
  regions: RegionState[]; ramps: RampState[];
  /** Optional: generator bridges; init copies them as locked. */
  bridges?: { id: number; regionA: number; regionB: number; cells: number[] }[];
}
