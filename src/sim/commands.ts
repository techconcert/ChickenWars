// Command union and dispatch table. Handlers live in the system files (src/sim/systems/*).
import type { Handler, TickCtx } from './ctx';
import type { GameState, MarchKind, Res, ResourceId, Slot, Target } from './state';
import * as allies from './systems/allies';
import * as city from './systems/city';
import * as economy from './systems/economy';
import * as heroes from './systems/heroes';
import * as marches from './systems/marches';
import * as military from './systems/military';
import * as research from './systems/research';
import * as traders from './systems/traders';
import * as world from './systems/world';
import * as progression from './progression/win';

export type Command =
  | { t: 'build'; building: string; cell: number }
  | { t: 'upgrade'; building: string }
  | { t: 'cancelBuild'; building: string }
  | { t: 'moveBuilding'; building: string; cell: number }
  | { t: 'reorderBuild'; job: string; to: number }
  | { t: 'demolish'; building: string }
  | { t: 'repair'; building: string }
  | { t: 'train'; troop: string; count: number }
  | { t: 'cancelTrain'; job: string }
  | { t: 'research'; tech: string }
  | { t: 'march'; hero: string; troops: Record<string, number>; target: Target; kind: MarchKind }
  | { t: 'recall'; march: string }
  | { t: 'heroTalent'; hero: string; talent: string }
  | { t: 'equip'; hero: string; slot: Slot; item: string | null }
  | { t: 'recruitHero'; hero: string }
  | { t: 'respec'; hero: string }
  | { t: 'upgradeItem'; item: string }
  | { t: 'allyRequest'; lord: string; choice: string }
  | { t: 'allyGift'; lord: string; gift: Res }
  | { t: 'allyTrade'; lord: string; give: ResourceId; get: ResourceId }
  | { t: 'acceptHeroOffer'; lord: string }
  | { t: 'startRally'; hero: string; troops: Record<string, number>; target: string }
  | { t: 'eventChoice'; option: number }
  | { t: 'marketTrade'; give: ResourceId; get: ResourceId; amount: number }
  | { t: 'setTrade'; on: boolean; weights: { food: number; wood: number; stone: number; gold: number } }
  | { t: 'debugGrant'; amount: number }
  | { t: 'continueSandbox' }
  | { t: 'setSpeed'; speed: 0 | 1 | 2 | 4 };

export type CommandType = Command['t'];
export type CommandOf<T extends CommandType> = Extract<Command, { t: T }>;
export type CommandHandlers = { [K in CommandType]: Handler<CommandOf<K>> };

/** setSpeed is recorded for replay but never touches state. */
const setSpeed: Handler<CommandOf<'setSpeed'>> = { validate: () => null, apply: () => undefined };

export const COMMAND_HANDLERS: CommandHandlers = {
  build: city.handlers.build, upgrade: city.handlers.upgrade, cancelBuild: city.handlers.cancelBuild, moveBuilding: city.handlers.moveBuilding, reorderBuild: city.handlers.reorderBuild,
  demolish: city.handlers.demolish, repair: city.handlers.repair,
  train: military.handlers.train, cancelTrain: military.handlers.cancelTrain,
  research: research.handlers.research,
  march: marches.handlers.march, recall: marches.handlers.recall,
  heroTalent: heroes.handlers.heroTalent, equip: heroes.handlers.equip, recruitHero: heroes.handlers.recruitHero, respec: heroes.handlers.respec, upgradeItem: heroes.handlers.upgradeItem,
  allyRequest: allies.handlers.allyRequest, allyGift: allies.handlers.allyGift, allyTrade: allies.handlers.allyTrade, acceptHeroOffer: allies.handlers.acceptHeroOffer, startRally: allies.handlers.startRally,
  eventChoice: world.handlers.eventChoice,
  marketTrade: economy.handlers.marketTrade,
  setTrade: traders.handlers.setTrade,
  debugGrant: economy.handlers.debugGrant,
  continueSandbox: progression.handlers.continueSandbox,
  setSpeed,
};

function handlerOf(cmd: Command): Handler<Command> | undefined {
  return COMMAND_HANDLERS[cmd.t] as Handler<Command> | undefined;
}

/** Validate without applying (used by the client for immediate UI feedback). Returns an error code or null. */
export function validateCommand(state: GameState, cmd: Command): string | null {
  const h = handlerOf(cmd);
  return h ? h.validate(state, cmd) : 'unknown_command';
}

export function applyCommand(state: GameState, cmd: Command, ctx: TickCtx): void {
  handlerOf(cmd)?.apply(state, cmd, ctx);
}
