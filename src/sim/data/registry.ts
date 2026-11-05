// Typed, validated, deep-frozen registries built from data/*.json. Fails loudly (file + path) on bad data.
import balanceJson from '@data/balance.json';
import buildingsJson from '@data/buildings.json';
import clansJson from '@data/clans.json';
import heroesJson from '@data/heroes.json';
import itemsJson from '@data/items.json';
import lordsJson from '@data/lords.json';
import bountiesJson from '@data/bounties.json';
import eventsJson from '@data/events.json';
import questsJson from '@data/quests.json';
import requestsJson from '@data/requests.json';
import researchJson from '@data/research.json';
import resourcesJson from '@data/resources.json';
import skillsJson from '@data/skills.json';
import startTypesJson from '@data/startTypes.json';
import talentsJson from '@data/talents.json';
import troopsJson from '@data/troops.json';
import worldJson from '@data/world.json';
import { DATA_SCHEMAS, parseData } from './schema';
import type {
  BuildingDef, BuildingEffectData, ClanDef, HeroDef, ItemDef, LordDef, QuestDef, RequestDef, ResearchDef,
  ResourceDef, SkillDef, StartTypeDef, TalentNode, TalentTree, TroopDef,
} from './schema';
import { generateBounties } from '../quests/bountyGen';
import { generateEvents } from '../systems/eventGen';
import { costAtLevel, ticksAtLevel } from '../util';
import type { Res } from '../state';

export function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}

function load<F extends keyof typeof DATA_SCHEMAS>(file: F, json: unknown) {
  return deepFreeze(parseData(file, DATA_SCHEMAS[file], json)) as ReturnType<(typeof DATA_SCHEMAS)[F]['parse']>;
}
function byId<T extends { id: string }>(file: string, list: readonly T[]): Readonly<Record<string, T>> {
  const out: Record<string, T> = {};
  for (const x of list) {
    if (out[x.id]) throw new Error(`Invalid data file ${file}: duplicate id ${x.id}`);
    out[x.id] = x;
  }
  return Object.freeze(out);
}

export const BALANCE = load('balance.json', balanceJson);
export const WORLD = load('world.json', worldJson);
export const EVENTS_DATA = load('events.json', eventsJson);
/** Authored events from world.json plus the generated pool (data/events.json). */
export const EVENT_LIST = deepFreeze([...WORLD.events, ...generateEvents(EVENTS_DATA)]);
export const EVENTS: Readonly<Record<string, (typeof EVENT_LIST)[number]>> = Object.fromEntries(EVENT_LIST.map((e) => [e.id, e]));
export const RESOURCE_LIST: readonly ResourceDef[] = load('resources.json', resourcesJson);
export const RESOURCES = byId('resources.json', RESOURCE_LIST);
export const BUILDING_LIST: readonly BuildingDef[] = load('buildings.json', buildingsJson);
export const BUILDINGS = byId('buildings.json', BUILDING_LIST);
export const TROOP_LIST: readonly TroopDef[] = load('troops.json', troopsJson);
export const TROOPS = byId('troops.json', TROOP_LIST);
export const HERO_LIST: readonly HeroDef[] = load('heroes.json', heroesJson);
export const HEROES = byId('heroes.json', HERO_LIST);
export const SKILLS = byId('skills.json', load('skills.json', skillsJson) as readonly SkillDef[]);
export const ITEM_LIST: readonly ItemDef[] = load('items.json', itemsJson);
export const ITEMS = byId('items.json', ITEM_LIST);
export const TALENT_TREES: readonly TalentTree[] = load('talents.json', talentsJson);
export const TALENTS: Readonly<Record<string, { tree: string; node: TalentNode }>> = (() => {
  const out: Record<string, { tree: string; node: TalentNode }> = {};
  for (const t of TALENT_TREES) for (const n of t.nodes) {
    if (out[n.id]) throw new Error(`Invalid data file talents.json: duplicate talent id ${n.id}`);
    out[n.id] = { tree: t.id, node: n };
  }
  return Object.freeze(out);
})();
export const RESEARCH_LIST: readonly ResearchDef[] = load('research.json', researchJson);
export const RESEARCH = byId('research.json', RESEARCH_LIST);
export const CLANS = byId('clans.json', load('clans.json', clansJson) as readonly ClanDef[]);
export const START_TYPES = byId('startTypes.json', load('startTypes.json', startTypesJson) as readonly StartTypeDef[]);
export const LORD_LIST: readonly LordDef[] = load('lords.json', lordsJson);
export const LORDS = byId('lords.json', LORD_LIST);
export const REQUEST_LIST: readonly RequestDef[] = load('requests.json', requestsJson);
export const REQUESTS = byId('requests.json', REQUEST_LIST);
export const QUEST_LIST: readonly QuestDef[] = load('quests.json', questsJson);
export const BOUNTIES = load('bounties.json', bountiesJson);
/** Generated bounty pool (data/bounties.json); kept out of QUEST_LIST so the authored chain stays separate. */
export const BOUNTY_LIST: readonly QuestDef[] = deepFreeze(generateBounties(BOUNTIES));
/** Authored quests plus the generated bounties, by id. */
export const QUESTS = byId('quests.json', [...QUEST_LIST, ...BOUNTY_LIST]);

// ---- helpers
type Resolve<E> = { [P in keyof E]: E[P] extends number[] ? number : E[P] };
export type ResolvedEffect<K extends BuildingEffectData['kind']> = Resolve<Extract<BuildingEffectData, { kind: K }>>;

function at(arr: readonly number[], level: number): number {
  return arr[Math.min(level, arr.length) - 1] ?? 0;
}

export function buildingCost(type: string, level: number): Res {
  const def = BUILDINGS[type];
  if (!def) throw new Error(`unknown building ${type}`);
  return costAtLevel(def, level);
}
export function buildingTicks(type: string, level: number): number {
  const def = BUILDINGS[type];
  if (!def) throw new Error(`unknown building ${type}`);
  return ticksAtLevel(def, level);
}

/** Resolved effect lists per building type, kind and level. The data is deep-frozen, so each list is computed once and frozen too. */
const effectsCache = new Map<string, Map<string, Map<number, readonly unknown[]>>>();

/** All effects of a kind for a building at `level`, with per-level arrays resolved to numbers. Level < 1 gives []. Do not mutate. */
export function effectsAt<K extends BuildingEffectData['kind']>(type: string, kind: K, level: number): readonly ResolvedEffect<K>[] {
  const def = BUILDINGS[type];
  if (!def || level < 1) return [];
  let byKind = effectsCache.get(type);
  if (!byKind) effectsCache.set(type, (byKind = new Map()));
  let byLevel = byKind.get(kind);
  if (!byLevel) byKind.set(kind, (byLevel = new Map()));
  const hit = byLevel.get(level);
  if (hit) return hit as readonly ResolvedEffect<K>[];
  const out: ResolvedEffect<K>[] = [];
  for (const e of def.effects) {
    if (e.kind !== kind) continue;
    const r: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(e)) r[k] = Array.isArray(v) ? at(v as number[], level) : v;
    out.push(r as ResolvedEffect<K>);
  }
  deepFreeze(out);
  byLevel.set(level, out);
  return out;
}
export function effectAt<K extends BuildingEffectData['kind']>(type: string, kind: K, level: number): ResolvedEffect<K> | undefined {
  return effectsAt(type, kind, level)[0];
}

/** Max instances of a building allowed at a Town Hall level. */
export function maxCountAt(type: string, thLevel: number): number {
  const def = BUILDINGS[type];
  if (!def) return 0;
  if (typeof def.maxCount === 'number') return def.maxCount;
  const a = def.maxCount.byTH;
  return a[Math.min(thLevel, a.length) - 1] ?? 0;
}

/** Hero XP needed to go from `level` to level+1. */
export function xpForLevel(level: number): number {
  let m = BALANCE.xpCurve.base;
  for (let i = 1; i < level; i++) m *= BALANCE.xpCurve.growth;
  return Math.round(m);
}
