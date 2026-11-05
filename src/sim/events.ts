// GameEvent union: drives toasts, audio, camera pings and render effects. Every event carries `tick`.
import type { ResourceId, Res } from './state';

export type GameEvent =
  | { t: 'CommandRejected'; tick: number; code: string; cmd: string }
  | { t: 'SeasonChanged'; tick: number; season: 0 | 1 | 2 | 3; year: number }
  | { t: 'DayStarted'; tick: number; day: number }
  | { t: 'BuildingStarted'; tick: number; building: string; type: string; level: number }
  | { t: 'BuildingCompleted'; tick: number; building: string; type: string; level: number; cell: number }
  | { t: 'BuildingUpgraded'; tick: number; building: string; type: string; level: number }
  | { t: 'BuildingMoved'; tick: number; building: string; type: string; cell: number }
  | { t: 'BuildingDemolished'; tick: number; building: string; type: string }
  | { t: 'BuildingDamaged'; tick: number; building: string }
  | { t: 'TroopsTrained'; tick: number; troop: string; count: number }
  | { t: 'TroopsHealed'; tick: number; troop: string; count: number }
  | { t: 'WoundedDied'; tick: number; count: number }
  | { t: 'ResearchCompleted'; tick: number; tech: string }
  | { t: 'ResourceOverflow'; tick: number; res: ResourceId; lost: number }
  | { t: 'Starvation'; tick: number; level: 'warning' | 'empty' | 'desertion' }
  | { t: 'MarchStarted'; tick: number; march: string; kind: string }
  | { t: 'MarchArrived'; tick: number; march: string; kind: string }
  | { t: 'MarchReturned'; tick: number; march: string; carried: Res }
  | { t: 'NodeDepleted'; tick: number; node: string }
  | { t: 'FogRevealed'; tick: number; cells: number }
  | { t: 'BattleResolved'; tick: number; report: number; winner: 'attacker' | 'defender'; target: string | null }
  | { t: 'CampCleared'; tick: number; poi: string; tier: number }
  | { t: 'BossDefeated'; tick: number; poi: string; boss: string }
  | { t: 'RegionUnlocked'; tick: number; region: number }
  | { t: 'BridgeUnlocked'; tick: number; bridge: number; by: 'boss' | 'research' }
  | { t: 'RaidWarning'; tick: number; raid: string; arriveAt: number }
  | { t: 'RaidResolved'; tick: number; raid: string; won: boolean; report?: number; loot?: Res; damaged?: string[] }
  | { t: 'RaidLaunched'; tick: number; raid: string; camp: string; arriveAt: number }
  | { t: 'AmbushResolved'; tick: number; march: string; won: boolean; report: number }
  | { t: 'AttackAborted'; tick: number; march: string; poi: string }
  | { t: 'LordStageChanged'; tick: number; lord: string; stage: string; from: string }
  | { t: 'RequestFulfilled'; tick: number; lord: string; request: string; kind: string }
  | { t: 'LordGift'; tick: number; lord: string; gift: Res; kind: 'seasonal' | 'player' | 'periodic'; item?: string }
  | { t: 'LordPerk'; tick: number; lord: string; perk: 'revealRegion' | 'lendTroops' | 'sharedVision' | 'heroOffer' | 'uniqueTech'; tech?: string }
  | { t: 'RallyDeparted'; tick: number; rally: string; lords: string[] }
  | { t: 'HeroRecruited'; tick: number; hero: string }
  | { t: 'HeroLevelUp'; tick: number; hero: string; level: number }
  | { t: 'ItemUpgraded'; tick: number; item: string; level: number }
  | { t: 'ItemDropped'; tick: number; item: string; def: string }
  | { t: 'LordRepChanged'; tick: number; lord: string; rep: number; delta: number }
  | { t: 'RequestPosted'; tick: number; lord: string; request: string }
  | { t: 'RequestExpired'; tick: number; lord: string; request: string }
  | { t: 'RallyStarted'; tick: number; rally: string }
  | { t: 'RallyJoined'; tick: number; rally: string; lord: string }
  | { t: 'QuestAdvanced'; tick: number; quest: string; step: number }
  | { t: 'QuestStarted'; tick: number; quest: string }
  | { t: 'QuestCompleted'; tick: number; quest: string }
  | { t: 'WorldEventPosted'; tick: number; event: string }
  | { t: 'ShrineBlessing'; tick: number; poi: string; boon: 'prod' | 'gather' | 'heal' | 'xp'; amount: number }
  | { t: 'TradersTraded'; tick: number; lord: string; give: Res; get: Res }
  | { t: 'Won'; tick: number };
