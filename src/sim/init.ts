// New-game state construction. Terrain is NOT generated here: the caller supplies the plain-array logic layer.
import { SAVE_VERSION } from './constants';
import { BALANCE, CLANS, HERO_LIST, QUEST_LIST, RESOURCE_LIST, START_TYPES, TROOP_LIST } from './data/registry';
import { hash32 } from './rng';
import type { BuildingInstance, GameOptions, GameState, HeroState, ResourceId, WorldLogicInput } from './state';
import { centreCellIndex, radiusFromCellCount } from './util';
import { generateWorldOverlay } from './worldgen';

export interface InitDeps { worldLogic: WorldLogicInput; baseTerrain: number[] }

export const DEFAULT_OPTIONS: GameOptions = { size: 'standard', difficulty: 'normal', startType: 'river_valley', clan: 'oakwarden' };

export function createInitialState(seed: number, options: Partial<GameOptions> = {}, deps: InitDeps): GameState {
  const opts: GameOptions = { ...DEFAULT_OPTIONS, ...options };
  const startType = START_TYPES[opts.startType];
  if (!startType) throw new Error(`unknown start type ${opts.startType}`);
  const clan = CLANS[opts.clan];
  if (!clan) throw new Error(`unknown clan ${opts.clan}`);
  const baseRadius = radiusFromCellCount(deps.baseTerrain.length);
  if (baseRadius < 0) throw new Error(`baseTerrain length ${deps.baseTerrain.length} is not a hex cell count`);
  const wl = deps.worldLogic;

  const resources = {} as Record<ResourceId, number>;
  const accum = {} as Record<ResourceId, number>;
  for (const r of RESOURCE_LIST) {
    resources[r.id] = startType.start.resources[r.id] ?? r.startAmount;
    accum[r.id] = 0;
  }

  const s: GameState = {
    version: SAVE_VERSION, seed: seed >>> 0, tick: 0, rng: hash32(seed, 'rng'), nextId: 1,
    options: opts, resources, accum,
    city: { radius: baseRadius, terrain: deps.baseTerrain.slice(), buildings: {}, queue: [], townHall: '', market: {} },
    world: {
      radius: wl.radius, terrainHash: wl.terrainHash, capitalCell: wl.capitalCell,
      regionOf: wl.regionOf.slice(), level: wl.level.slice(), biome: wl.biome.slice(), flags: wl.flags.slice(), navCost: wl.navCost.slice(),
      regions: wl.regions.map((r) => ({ ...r, neighbours: r.neighbours.slice() })),
      ramps: wl.ramps.map((r) => ({ ...r, cells: r.cells.slice() })),
      ...(wl.bridges && wl.bridges.length ? { bridges: wl.bridges.map((b) => ({ id: b.id, regionA: b.regionA, regionB: b.regionB, cells: b.cells.slice(), unlocked: false })) } : {}),
      fog: wl.regionOf.map(() => 0), nodes: {}, pois: {},
    },
    troops: {}, training: [], heroes: {}, inventory: {}, tavern: { candidates: [], refreshAt: 0 },
    marches: {}, raids: {}, research: { done: [], active: [] },
    quests: { active: null, stepProgress: [], completed: [], counters: {} },
    season: { index: 0, dayOfSeason: 0, year: 0, day: 0 },
    lords: {}, rallies: {}, pendingEvent: null, buffs: [], reports: [], log: [],
    chronicle: [{ tick: 0, text: 'The first egg is laid. A new farm is founded.' }],
    stats: { battlesWon: 0, battlesLost: 0, gathered: 0, campsCleared: 0, bossesKilled: 0 },
    flags: { won: false, sandbox: false, safeMode: false },
  };
  for (const t of TROOP_LIST) s.troops[t.id] = { healthy: 0, wounded: 0 };

  // Town Hall at the centre cell of the base grid (level 1, complete).
  const thId = String(s.nextId++);
  const th: BuildingInstance = { id: thId, type: 'town_hall', cell: centreCellIndex(baseRadius), level: 1, damaged: false };
  s.city.buildings[thId] = th;
  s.city.townHall = thId;

  // Starting hero (heroes.json recruit.kind 'start'); clan heroStartLevel applied once.
  const startHero = HERO_LIST.find((h) => h.recruit.kind === 'start');
  if (!startHero) throw new Error('heroes.json has no start hero');
  let bonus = 0;
  for (const e of clan.effects) if (e.kind === 'heroStartLevel') bonus += e.amount;
  const hero: HeroState = {
    id: startHero.id, level: 1 + bonus, xp: 0, talents: {},
    equipment: { weapon: null, armour: null, banner: null, trinket: null }, march: null, skillRank: 1,
  };
  s.heroes[hero.id] = hero;

  const q0 = QUEST_LIST[0];
  if (q0) { s.quests.active = q0.id; s.quests.stepProgress = q0.steps.map(() => 0); }
  void BALANCE;
  generateWorldOverlay(s);
  return s;
}
