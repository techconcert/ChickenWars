// Zod schemas for every file in data/. Mirror docs/data-schemas.md.
// Objects are strict: unknown keys are errors, so new fields need a schema update (and a doc line).
import { z } from 'zod';

const Id = z.string().regex(/^[a-z][a-z0-9_]*$/, 'id must be snake_case');
export const ResIdSchema = z.enum(['food', 'wood', 'stone', 'gold', 'ember']);
export const ResSchema = z.record(ResIdSchema, z.number().nonnegative());
const ResOrAll = z.union([ResIdSchema, z.literal('all')]);
const Nums = z.array(z.number()).min(1);
const Pct = z.number();
const TroopClass = z.enum(['infantry', 'archer', 'cavalry', 'siege']);
const Rarity = z.enum(['common', 'uncommon', 'rare', 'epic']);
const Slot = z.enum(['weapon', 'armour', 'banner', 'trinket']);
const HeroClass = z.enum(['warrior', 'ranger', 'strategist']);
const Range2 = z.tuple([z.number(), z.number()]);
const s = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();

// ---- resources.json
export const ResourcesSchema = z.array(s({ id: ResIdSchema, name: z.string(), color: z.string(), icon: z.string(), startAmount: z.number().nonnegative(), baseCap: z.number().positive() }));

// ---- Effects (shared vocabulary for clans, research, talents)
export const EffectSchema = z.discriminatedUnion('kind', [
  s({ kind: z.literal('prodMult'), res: ResIdSchema, pct: Pct }),
  s({ kind: z.literal('capMult'), res: ResOrAll, pct: Pct }),
  s({ kind: z.literal('adjacency'), building: Id, pct: Pct }),
  s({ kind: z.literal('classAtk'), class: TroopClass, pct: Pct }),
  s({ kind: z.literal('classDef'), class: TroopClass, pct: Pct }),
  s({ kind: z.literal('buildingHp'), category: z.string(), pct: Pct }),
  s({ kind: z.literal('costMult'), troopClass: TroopClass, pct: Pct }),
  s({ kind: z.literal('marchSpeed'), pct: Pct }),
  s({ kind: z.literal('tradeStep'), steps: z.number().int() }),
  s({ kind: z.literal('trainTime'), pct: Pct }),
  s({ kind: z.literal('heroStartLevel'), amount: z.number().int() }),
  s({ kind: z.literal('upkeepMult'), pct: Pct }),
  s({ kind: z.literal('unlockTroop'), troop: Id }),
  s({ kind: z.literal('visionRadius'), amount: z.number() }),
  s({ kind: z.literal('raidWarning'), ticks: z.number() }),
  s({ kind: z.literal('woundedRatio'), pct: Pct }),
  s({ kind: z.literal('heroStat'), stat: z.enum(['atk', 'def', 'hp', 'lead', 'gather']), pct: Pct }),
  s({ kind: z.literal('skillRank'), amount: z.number().int() }),
  s({ kind: z.literal('rageGain'), pct: Pct }),
  // M6 research vocabulary (additive)
  s({ kind: z.literal('gatherMult'), pct: Pct }),
  s({ kind: z.literal('marchSlots'), amount: z.number().int() }),
  s({ kind: z.literal('researchSlots'), amount: z.number().int() }),
  s({ kind: z.literal('trainSpeed'), class: TroopClass, pct: Pct }),
  s({ kind: z.literal('classHp'), class: TroopClass, pct: Pct }),
  s({ kind: z.literal('healMult'), pct: Pct }),
  s({ kind: z.literal('buildSpeed'), pct: Pct }),
  s({ kind: z.literal('wallHp'), pct: Pct }),
  s({ kind: z.literal('towerAtk'), pct: Pct }),
  s({ kind: z.literal('supplyMult'), pct: Pct }),
  s({ kind: z.literal('fogReveal'), amount: z.number() }),
  /** Completing the tech opens every sea bridge (Islands start type). */
  s({ kind: z.literal('unlockBridges') }),
]);
export type EffectData = z.infer<typeof EffectSchema>;

// ---- Building effects (level-indexed arrays)
export const BuildingEffectSchema = z.discriminatedUnion('kind', [
  s({ kind: z.literal('produce'), res: ResIdSchema, perMinute: Nums }),
  s({ kind: z.literal('cap'), res: ResOrAll, amount: Nums }),
  s({ kind: z.literal('builders'), count: Nums }),
  s({ kind: z.literal('marchSlots'), count: Nums }),
  s({ kind: z.literal('trainSpeed'), troopClass: TroopClass, mult: Nums }),
  s({ kind: z.literal('heal'), perMinute: Nums }),
  s({ kind: z.literal('woundedCap'), amount: Nums }),
  s({ kind: z.literal('researchSlots'), count: Nums }),
  s({ kind: z.literal('heroCandidates'), count: Nums }),
  s({ kind: z.literal('vision'), radius: Nums }),
  s({ kind: z.literal('territory'), radius: Nums }),
  s({ kind: z.literal('defence'), hp: Nums, atk: Nums }),
  s({ kind: z.literal('popCap'), amount: Nums }),
  /** Trading Post: how many traders the post can field. */
  s({ kind: z.literal('traderCap'), count: Nums }),
  s({ kind: z.literal('unlock'), target: z.string() }),
  /** Market: max amount of one resource that can be given in a single trade (once per cooldown per resource). */
  s({ kind: z.literal('tradeLimit'), amount: Nums }),
]);
export type BuildingEffectData = z.infer<typeof BuildingEffectSchema>;

export const BuildingSchema = s({
  id: Id, name: z.string(),
  category: z.enum(['core', 'economy', 'military', 'support', 'defence']),
  maxLevel: z.number().int().positive(), unlockTH: z.number().int().positive(),
  maxCount: z.union([z.number().int().nonnegative(), s({ byTH: z.array(z.number().int().nonnegative()).min(1) })]),
  baseCost: ResSchema, costGrowth: z.number().min(1), baseTicks: z.number().positive(), timeGrowth: z.number().min(1),
  requires: z.array(s({ building: Id, level: z.number().int().positive() })).optional(),
  effects: z.array(BuildingEffectSchema),
  footprint: z.literal(1).optional(),
  mesh: z.string(),
});
export const BuildingsSchema = z.array(BuildingSchema);

// ---- troops.json
export const TroopSchema = s({
  id: Id, name: z.string(), class: TroopClass, tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  atk: z.number(), def: z.number(), hp: z.number().positive(), speed: z.number().positive(), load: z.number().nonnegative(),
  upkeepFoodPerMinute: z.number().nonnegative(), popCost: z.number().int().positive(),
  cost: ResSchema, trainTicks: z.number().positive(), building: Id, minBuildingLevel: z.number().int().positive(),
  gatherRate: z.number().nonnegative(), requiresTech: Id.optional(), mesh: z.string().optional(),
  /** `trader`: never marches or fights; trades automatically (systems/traders.ts). */
  role: z.enum(['trader', 'enemy']).optional(),
});
export const TroopsSchema = z.array(TroopSchema);

// ---- skills.json (combat effects)
export const CombatEffectSchema = z.discriminatedUnion('kind', [
  s({ kind: z.literal('damageLargestStack'), mult: z.number() }),
  s({ kind: z.literal('buffAtk'), pct: Pct, rounds: z.number().int() }),
  s({ kind: z.literal('damageClass'), class: TroopClass, mult: z.number() }),
  s({ kind: z.literal('damageTaken'), pct: Pct, rounds: z.number().int() }),
  s({ kind: z.literal('buffClassAtk'), class: TroopClass, pct: Pct, rounds: z.number().int() }),
  s({ kind: z.literal('woundedShare'), pct: Pct }),
]);
export const SkillsSchema = z.array(s({ id: Id, name: z.string(), rage: z.number().positive(), effect: z.array(CombatEffectSchema) }));

// ---- heroes.json
const Stats5 = s({ atk: z.number(), def: z.number(), hp: z.number(), lead: z.number(), gather: z.number() });
export const HeroSchema = s({
  id: Id, name: z.string(), class: HeroClass, skill: Id, portraitRecipe: z.string().optional(),
  recruit: z.discriminatedUnion('kind', [
    s({ kind: z.literal('start') }),
    s({ kind: z.literal('tavern'), cost: ResSchema }),
    s({ kind: z.literal('quest'), quest: Id }),
    s({ kind: z.literal('poi'), poi: Id }),
    /** Offered by an allied lord (stage allied); claimed with the acceptHeroOffer command. */
    s({ kind: z.literal('ally'), lord: Id }),
  ]),
  baseStats: Stats5, growth: Stats5,
});
export const HeroesSchema = z.array(HeroSchema);

// ---- items.json
export const ItemSchema = s({
  id: Id, name: z.string(), slot: Slot, rarity: Rarity,
  stats: s({ atk: z.number().optional(), def: z.number().optional(), hp: z.number().optional(), lead: z.number().optional(), gather: z.number().optional() }),
  source: z.array(z.enum(['camp', 'lair', 'boss', 'quest'])).min(1),
});
export const ItemsSchema = z.array(ItemSchema);

// ---- talents.json
export const TalentNodeSchema = s({
  id: Id, name: z.string(), tier: z.number().int().min(1).max(4),
  requires: s({ points: z.number().int().nonnegative().optional(), nodes: z.array(Id).optional() }),
  maxRank: z.number().int().positive(), effects: z.array(EffectSchema).min(1),
});
export const TalentsSchema = z.array(s({ id: HeroClass, name: z.string(), nodes: z.array(TalentNodeSchema).min(1) }));

// ---- research.json
export const ResearchSchema = z.array(s({
  id: Id, name: z.string(), branch: z.enum(['economy', 'military', 'defence', 'exploration']), tier: z.number().int().min(1).max(4),
  requires: z.array(Id), cost: ResSchema, ticks: z.number().positive(), academyLevel: z.number().int().positive(), effects: z.array(EffectSchema).min(1),
  /** Extra gate: state.quests.counters[requiresFlag] must be >= 1 (ally techs use `allyTech_<lord>`). */
  requiresFlag: z.string().min(1).optional(),
}));

// ---- clans.json, startTypes.json, lords.json
export const ClansSchema = z.array(s({ id: Id, name: z.string(), banner: z.string(), effects: z.array(EffectSchema) }));
export const StartTypesSchema = z.array(s({
  id: Id, name: z.string().optional(),
  terrain: s({ river: z.boolean(), snowBaseline: z.number(), islands: z.number().int().positive() }),
  season: s({ springDays: z.number().int().positive(), summerDays: z.number().int().positive(), autumnDays: z.number().int().positive(), winterDays: z.number().int().positive() }),
  start: s({ resources: ResSchema }),
}));
export const LordsSchema = z.array(s({
  id: Id, name: z.string(), banner: z.string(), personality: z.enum(['builder', 'trader', 'warlike', 'scholar']),
  likes: z.array(ResIdSchema), dislikes: z.array(ResIdSchema), regionTier: z.number().int().min(1).max(6),
  /** The lord's standing army (lent to city defence and rallies by percentage). */
  army: z.array(s({ troop: Id, count: z.number().int().positive() })).min(1),
  /** Synthetic hero stats for rallies (stats count at the ally-hero share). */
  hero: s({ atk: z.number(), def: z.number(), hp: z.number() }),
}));

// ---- requests.json (lord request templates)
export const RequestsSchema = z.array(s({
  id: Id, kind: z.enum(['deliver', 'clearCamp', 'escort', 'defend']), weight: z.number().positive(),
  expiresTicks: z.number().positive(), urgent: z.boolean(), personalities: z.array(z.enum(['builder', 'trader', 'warlike', 'scholar'])).optional(),
  data: z.record(z.string(), z.union([z.string(), z.number()])),
  reward: s({ rep: z.number(), resources: ResSchema.optional(), item: Id.optional() }),
}));

// ---- quests.json
export const QuestStepSchema = z.discriminatedUnion('kind', [
  s({ kind: z.literal('buildingBuilt'), building: Id, count: z.number().int().positive() }),
  s({ kind: z.literal('buildingLevel'), building: Id, level: z.number().int().positive() }),
  s({ kind: z.literal('trained'), troop: Id, count: z.number().int().positive() }),
  s({ kind: z.literal('gathered'), amount: z.number().positive() }),
  s({ kind: z.literal('cellsExplored'), count: z.number().int().positive() }),
  s({ kind: z.literal('campCleared'), tier: z.number().int().min(1).max(5), count: z.number().int().positive() }),
  s({ kind: z.literal('ruinExplored'), count: z.number().int().positive() }),
  s({ kind: z.literal('researchDone'), count: z.number().int().positive() }),
  s({ kind: z.literal('giftGiven'), count: z.number().int().positive() }),
  s({ kind: z.literal('heroRecruited'), count: z.number().int().positive() }),
  s({ kind: z.literal('bossKilled'), tier: z.number().int().min(1).max(6), count: z.number().int().positive() }),
  /** Generic counter: state.quests.counters[key] >= value (absolute), or grown by `value` since the quest started when delta is true. */
  s({ kind: z.literal('counter'), key: z.string().min(1), value: z.number().positive(), delta: z.boolean().optional(), label: z.string().optional() }),
]);
export type QuestStepData = z.infer<typeof QuestStepSchema>;
export const QuestsSchema = z.array(s({
  id: Id, title: z.string(), text: z.string(), steps: z.array(QuestStepSchema).min(1),
  rewards: s({ resources: ResSchema.optional(), item: Id.optional(), hero: Id.optional(), xp: z.number().optional(), troops: z.record(Id, z.number().int().positive()).optional() }),
  next: Id.nullable(),
  /** Side quest: offered once when state.quests.counters[counter] >= value; runs beside the chain and is not part of it. */
  trigger: s({ counter: z.string().min(1), value: z.number().positive() }).optional(),
}));

// ---- bounties.json: templates x bands x variants generate the rotating bounty board (src/sim/quests/bountyGen.ts)
export const BountiesSchema = s({
  slots: z.number().int().positive(), lifeDays: z.number().int().positive(), refillDays: z.number().int().positive(), startAfter: Id,
  bands: z.array(s({
    id: z.number().int().positive(), name: z.string(), th: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    count: z.number().positive(), reward: z.number().positive(), rarity: Rarity, opener: z.string(),
  })).min(1),
  variants: z.array(s({ id: Id, count: z.number().positive(), reward: z.number().positive(), extras: z.boolean() })).min(1),
  templates: z.array(s({
    id: Id, step: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])), base: z.number().positive(), value: z.number().positive(), bands: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    res: ResSchema, titles: z.array(z.string()).min(1), text: z.string(), scale: z.number().min(0).optional(), label: z.string().optional(),
  })).min(1),
});
export type BountiesData = z.infer<typeof BountiesSchema>;

// ---- events.json: templates x bands x variants generate the random-event pool (src/sim/systems/eventGen.ts)
export const EventsSchema = s({
  recent: z.number().int().nonnegative(),
  bands: z.array(s({ id: z.number().int().positive(), name: z.string(), th: z.tuple([z.number().int().positive(), z.number().int().positive()]), value: z.number().positive(), campTier: z.number().int().min(1).max(5) })).min(1),
  templates: z.array(s({
    id: Id, kind: z.enum(['trade', 'gamble', 'buff', 'camp', 'cost']), titles: z.array(z.string()).min(1), text: z.string(),
    bands: z.tuple([z.number().int().positive(), z.number().int().positive()]), season: z.enum(['spring', 'summer', 'autumn', 'winter']).optional(),
    give: ResSchema.optional(), get: ResSchema.optional(), win: ResSchema.optional(), lose: ResSchema.optional(), chance: z.number().optional(),
    cost: ResSchema.optional(), pay: ResSchema.optional(), stat: z.string().optional(), pct: z.number().optional(), ticks: z.number().optional(), node: Id.optional(),
  })).min(1),
});
export type EventsData = z.infer<typeof EventsSchema>;

// ---- world.json
const Stack = s({ troop: Id, count: z.number().int().positive() });
const EventEffect = z.discriminatedUnion('kind', [
  s({ kind: z.literal('trade'), give: ResSchema, get: ResSchema }),
  s({ kind: z.literal('spawnCamp'), tier: z.number().int().min(1).max(5) }),
  s({ kind: z.literal('blockNode'), type: Id, ticks: z.number().positive() }),
  s({ kind: z.literal('buff'), stat: z.string(), pct: Pct, ticks: z.number().positive() }),
  /** Seeded roll (hashRand on seed+tick): `chance` percent pays `win`, otherwise the player loses `lose` (clamped to what they have). */
  s({ kind: z.literal('gamble'), chance: z.number().min(1).max(99), win: ResSchema, lose: ResSchema }),
  z.object({ kind: z.literal('cost') }).catchall(z.number()), // { kind:'cost', gold: 100 }: resource keys inline
]);
const RareEntry = z.discriminatedUnion('kind', [
  s({ kind: z.literal('none'), weight: z.number().nonnegative(), bias: z.number() }),
  s({ kind: z.literal('resource'), res: ResIdSchema, amount: Range2, weight: z.number().nonnegative(), bias: z.number() }),
  s({ kind: z.literal('item'), rarity: Rarity, weight: z.number().nonnegative(), bias: z.number() }),
]);
export type RareEntryData = z.infer<typeof RareEntry>;
export const WorldSchema = s({
  nodeTypes: z.array(s({
    id: Id, resource: ResIdSchema, biomes: z.array(z.enum(['beach', 'meadow', 'forest', 'highland', 'snow'])),
    amountByTier: z.array(z.number().nonnegative()).length(6), respawnTicks: z.number().positive(), minTier: z.number().int().optional(),
  })),
  poiTypes: z.array(s({ id: Id, countPerRegionByTier: z.array(z.number().int().nonnegative()).length(6), homeBoss: z.boolean().optional() })),
  banditCamps: z.array(s({
    tier: z.number().int().min(1).max(5), troops: z.array(Stack).min(1), baseStrength: z.number().positive(),
    growthPerDay: z.number().nonnegative(), tierCap: z.number().positive(), raidThreshold: z.number().positive(),
  })),
  regionTiers: z.array(s({ tier: z.number().int().min(1).max(6), name: z.string(), unlockCityLevel: z.number().int().positive(), cityLevelRange: Range2, nodeDensity: z.number().positive() })),
  bosses: z.array(s({ tier: z.number().int().min(2).max(6), id: Id, name: z.string(), heroLevel: z.number().int().positive(), troops: z.array(Stack).min(1) })),
  events: z.array(s({
    id: Id, title: z.string(), text: z.string().optional(), weight: z.number().positive(), season: z.enum(['spring', 'summer', 'autumn', 'winter']).optional(),
    options: z.array(s({ label: z.string(), effect: z.array(EventEffect) })).min(1),
  })),
  lootTables: z.array(s({
    tier: z.number().int().min(1).max(5),
    resources: z.record(ResIdSchema, Range2),
    rare: z.array(RareEntry).min(1),
  })),
});

// ---- balance.json
const GiftCfg = s({ minRep: z.number(), everyDays: z.number().int().positive(), base: z.number().positive(), itemChance: z.number().min(0).max(1) });
const DifficultySchema = s({ banditStrength: z.number(), banditGrowth: z.number(), gather: z.number(), warningMult: z.number(), raidThresholdMult: z.number().positive() });
const SeasonModSchema = s({
  food: z.number(), wood: z.number(), stone: z.number(), gold: z.number(),
  gather: z.number(), upkeep: z.number(), banditGrowth: z.number(), marchSpeed: z.number(),
});
export const BalanceSchema = s({
  gatherMult: z.number(), upkeepMult: z.number(), offlineCapTicks: z.number().int().positive(), raidWarningTicks: z.number().int().positive(),
  xpCurve: s({ base: z.number().positive(), growth: z.number().min(1) }),
  difficulty: s({ easy: DifficultySchema, normal: DifficultySchema, hard: DifficultySchema }),
  seasonMods: s({ spring: SeasonModSchema, summer: SeasonModSchema, autumn: SeasonModSchema, winter: SeasonModSchema }),
  traders: s({ intervalTicks: z.number().int().positive(), loadPerTrader: z.number().int().positive(), commission: z.number().min(0).max(1) }),
  autoScout: s({ speedMult: z.number().positive().max(1), maxLegs: z.number().int().positive(), minDistance: z.number().int().positive(), pickFrom: z.number().int().positive() }),
  proximity: z.record(Id, s({ terrain: z.array(z.number().int().min(0).max(4)).min(1), radius: z.number().int().min(2).max(6), perCell: z.number().positive(), max: z.number().positive(), label: z.string() })),
  productionFloor: z.number().min(0).max(1),
  starvation: s({ intervalTicks: z.number().int().positive(), desertPct: z.number() }),
  woundedShare: s({ base: z.number().min(0).max(1), max: z.number().min(0).max(1) }),
  demolishRefund: z.number().min(0).max(1),
  cancelRefund: s({ early: z.number(), late: z.number(), earlyThreshold: z.number() }),
  territoryMaxRadius: z.number().int().positive(), marchSlotsMax: z.number().int().positive(),
  combat: s({
    maxRounds: z.number().int().positive(), defenceK: z.number().positive(), counterMult: z.number(), counteredMult: z.number(),
    siegeVsFort: z.number(), uphillPerLevel: z.number(), uphillCap: z.number(),
  }),
  lootScaling: s({ qtyPerLevel: z.number(), minMult: z.number(), maxMult: z.number(), rarePerLevel: z.number() }),
  buildQueueExtra: z.number().int().nonnegative(), buildQueueMax: z.number().int().positive(), trainQueueMax: z.number().int().positive(), trainBatchMax: z.number().int().positive(),
  tavernRefreshTicks: z.number().int().positive(), heroMax: z.number().int().positive(), heroMaxLevel: z.number().int().positive(),
  respecCostGold: z.number().nonnegative(), rallyWaitTicks: z.number().int().positive(), reportsKept: z.number().int().positive(),
  eventIntervalDays: z.number().positive(), marketCooldownTicks: z.number().int().positive(),
  raidRange: z.number().int().positive(),
  raids: s({
    graceDays: z.number().int().nonnegative(), minTownHall: z.number().int().positive(),
    cooldownTicks: z.number().int().positive(), checkInterval: z.number().int().positive(), launchChance: z.number().min(0).max(1),
    weakFactor: z.number().positive(), ticksPerCell: z.number().positive(), lootPct: z.number().min(0).max(1), lootMinPct: z.number().min(0).max(1),
    protectPerLevel: z.number().min(0), protectMax: z.number().min(0).max(1), wallAbsorbPct: z.number().min(0).max(100),
    towerDamageMult: z.number().min(0), damagedBuildingsMax: z.number().int().positive(), defeatCampLoss: z.number().min(0).max(1),
    peril: z.number().int().positive(), ambushPerTier: z.number().min(0), ambushMax: z.number().min(0).max(1), ambushStrength: z.number().positive(),
    safeAttackRatio: z.number().positive(), hostileThresholdMult: z.number().positive(),
  }),
  allies: s({
    giftValue: ResSchema, giftRepPerValue: z.number().positive(), giftDiminish: z.number().min(0).max(1), likeMult: z.number(), dislikeMult: z.number(),
    decayDays: z.number().int().positive(), decayFloor: z.number(), tradeLot: z.number().int().positive(), tradeLikePm: z.number(),
    tradeLimits: s({ wary: z.number().int().positive(), friendly: z.number().int().positive(), allied: z.number().int().positive() }),
    requestMinDays: z.number().int().positive(), requestMaxDays: z.number().int().positive(), requestsMax: z.number().int().positive(),
    clearCampRadius: z.number().int().positive(), clearCampRep: z.number(), refuseStreak: z.number().int().positive(), refuseStreakPenalty: z.number(),
    urgentIgnoredPenalty: z.number(), seasonGift: s({ friendly: z.number(), allied: z.number() }), gifts: s({ thScale: z.number().nonnegative(), wary: GiftCfg, friendly: GiftCfg, allied: GiftCfg }), lendPct: z.number(), rallyArmyPct: z.number(),
    rallyPlayerPct: z.number().min(0).max(100), rallyJoinRep: z.number(), rallyKillRep: z.number(), lordTicksPerCell: z.number().positive(),
  }),
});

/** One schema per data file; `validate-data` and the registry both use this table. */
export const DATA_SCHEMAS = {
  'balance.json': BalanceSchema,
  'events.json': EventsSchema,
  'bounties.json': BountiesSchema,
  'buildings.json': BuildingsSchema,
  'clans.json': ClansSchema,
  'heroes.json': HeroesSchema,
  'items.json': ItemsSchema,
  'lords.json': LordsSchema,
  'quests.json': QuestsSchema,
  'requests.json': RequestsSchema,
  'research.json': ResearchSchema,
  'resources.json': ResourcesSchema,
  'skills.json': SkillsSchema,
  'startTypes.json': StartTypesSchema,
  'talents.json': TalentsSchema,
  'troops.json': TroopsSchema,
  'world.json': WorldSchema,
} as const;
export type DataFile = keyof typeof DATA_SCHEMAS;

export type WorldEventData = z.infer<typeof WorldSchema>['events'][number];
export type BuildingDef = z.infer<typeof BuildingSchema>;
export type TroopDef = z.infer<typeof TroopSchema>;
export type HeroDef = z.infer<typeof HeroSchema>;
export type ItemDef = z.infer<typeof ItemSchema>;
export type TalentTree = z.infer<typeof TalentsSchema>[number];
export type TalentNode = z.infer<typeof TalentNodeSchema>;
export type ResearchDef = z.infer<typeof ResearchSchema>[number];
export type QuestDef = z.infer<typeof QuestsSchema>[number];
export type SkillDef = z.infer<typeof SkillsSchema>[number];
export type LordDef = z.infer<typeof LordsSchema>[number];
export type ClanDef = z.infer<typeof ClansSchema>[number];
export type StartTypeDef = z.infer<typeof StartTypesSchema>[number];
export type RequestDef = z.infer<typeof RequestsSchema>[number];
export type ResourceDef = z.infer<typeof ResourcesSchema>[number];
export type WorldData = z.infer<typeof WorldSchema>;
export type BalanceData = z.infer<typeof BalanceSchema>;

/** Parse with a loud, path-qualified error message listing every issue. */
export function parseData<T extends z.ZodTypeAny>(file: string, schema: T, json: unknown): z.infer<T> {
  const r = schema.safeParse(json);
  if (r.success) return r.data;
  const lines = r.error.issues.slice(0, 20).map((i) => `  ${file}: ${i.path.join('.') || '(root)'}: ${i.message}`);
  throw new Error(`Invalid data file ${file}\n${lines.join('\n')}`);
}
