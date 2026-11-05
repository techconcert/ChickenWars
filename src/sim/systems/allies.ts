// Allies system (docs/systems/allies.md): lord reputation, gifts, trade, requests, rallies, stage perks.
import type { CommandOf } from '../commands';
import { emit } from '../ctx';
import type { Handler, TickCtx } from '../ctx';
import { cellDistance, gridFor } from '../nav';
import {
  alliedLords, applyGift, changeRep, completeRequest, giftError, lordStage, openRally, parseChoice, refuseRequest, requestReady,
  periodicGifts, seasonalGifts, syncStage, tickRallies, tickRequestPosting, tickRequests, tradeLimit, tradeYield,
} from '../allies';
import { DAY_TICKS } from '../constants';
import { BALANCE, HERO_LIST } from '../data/registry';
import { grantHero } from './heroes';
import { getCaps } from '../city/caps';
import type { GameState, LordRequest } from '../state';
import { sortedKeys } from '../util';
import * as marches from './marches';

const RES: readonly string[] = ['food', 'wood', 'stone', 'gold'];

function findRequest(state: GameState, lordId: string, id: string | null, want: (r: LordRequest) => boolean): LordRequest | undefined {
  const l = state.lords[lordId];
  if (!l) return undefined;
  return l.requests.find((r) => (id === null || r.id === id) && want(r));
}

/** Clearing a camp near a village earns that lord reputation; scans this tick's CampCleared events. */
function campClearRep(state: GameState, ctx: TickCtx): void {
  const g = gridFor(state.world.radius);
  for (const e of ctx.events.slice()) {
    if (e.t !== 'CampCleared' || e.tick !== state.tick) continue;
    const camp = state.world.pois[e.poi];
    if (!camp) continue;
    for (const id of sortedKeys(state.lords)) {
      const v = state.world.pois[state.lords[id]!.poi];
      if (v && cellDistance(g, v.cell, camp.cell) <= BALANCE.allies.clearCampRadius) changeRep(state, ctx, id, BALANCE.allies.clearCampRep + e.tier - 1);
    }
  }
}

export function tickAllies(state: GameState, ctx: TickCtx): void {
  const dayStart = state.tick > 0 && state.tick % DAY_TICKS === 0;
  campClearRep(state, ctx);
  if (dayStart && state.season.day % BALANCE.allies.decayDays === 0) {
    for (const id of sortedKeys(state.lords)) {
      if (state.lords[id]!.rep > BALANCE.allies.decayFloor) changeRep(state, ctx, id, -1);
    }
  }
  if (dayStart && state.season.day > 0) periodicGifts(state, ctx);
  if (dayStart && state.season.dayOfSeason === 0 && state.season.day > 0) seasonalGifts(state, ctx);
  tickRequestPosting(state, ctx);
  tickRequests(state, ctx);
  for (const id of sortedKeys(state.lords)) syncStage(state, ctx, id);
  tickRallies(state, ctx);
}

type AllyKeys = 'allyRequest' | 'allyGift' | 'allyTrade' | 'startRally' | 'acceptHeroOffer';

/** The hero an allied lord offers (heroes.json recruit.kind 'ally'), or undefined. */
export function offeredHero(lordId: string): string | undefined {
  return HERO_LIST.find((h) => h.recruit.kind === 'ally' && h.recruit.lord === lordId)?.id;
}

export const handlers: { [K in AllyKeys]: Handler<CommandOf<K>> } = {
  allyGift: {
    validate: (state, cmd) => giftError(state, cmd.lord, cmd.gift),
    apply(state, cmd, ctx) { applyGift(state, ctx, cmd.lord, cmd.gift); },
  },
  allyTrade: {
    validate(state, cmd) {
      const l = state.lords[cmd.lord];
      if (!l) return 'unknown_lord';
      if (!RES.includes(cmd.give) || !RES.includes(cmd.get) || cmd.give === cmd.get) return 'bad_trade';
      if (tradeLimit(lordStage(l.rep)) === 0) return 'hostile';
      const done = l.tradeDay === state.season.day ? (l.tradesToday ?? 0) : 0;
      if (done >= tradeLimit(lordStage(l.rep))) return 'cooldown';
      if (state.resources[cmd.give] < BALANCE.allies.tradeLot) return 'cost';
      if (tradeYield(state, cmd.lord, cmd.give) < 1) return 'bad_trade';
      if (state.resources[cmd.get] >= getCaps(state)[cmd.get]) return 'cap_full';
      return null;
    },
    apply(state, cmd, ctx) {
      const l = state.lords[cmd.lord]!;
      const got = tradeYield(state, cmd.lord, cmd.give);
      state.resources[cmd.give] -= BALANCE.allies.tradeLot;
      state.resources[cmd.get] = Math.min(getCaps(state)[cmd.get], state.resources[cmd.get] + got);
      if (l.tradeDay !== state.season.day) { l.tradeDay = state.season.day; l.tradesToday = 0; }
      l.tradesToday = (l.tradesToday ?? 0) + 1;
      emit(ctx, { t: 'LordGift', tick: state.tick, lord: cmd.lord, gift: { [cmd.get]: got }, kind: 'player' });
    },
  },
  // Counter heroOffer_<lord>: 1 = offered (set when the lord becomes allied), 2 = accepted. Taking it is the player's choice (D30).
  acceptHeroOffer: {
    validate(state, cmd) {
      if (!state.lords[cmd.lord]) return 'unknown_lord';
      if ((state.quests.counters[`heroOffer_${cmd.lord}`] ?? 0) !== 1) return 'no_offer';
      const h = offeredHero(cmd.lord);
      if (!h) return 'no_offer';
      return state.heroes[h] ? 'owned' : null;
    },
    apply(state, cmd, ctx) {
      const h = offeredHero(cmd.lord);
      if (h && grantHero(state, h, ctx)) state.quests.counters[`heroOffer_${cmd.lord}`] = 2;
    },
  },
  allyRequest: {
    validate(state, cmd) {
      const l = state.lords[cmd.lord];
      if (!l) return 'unknown_lord';
      const { verb, id } = parseChoice(cmd.choice);
      if (verb !== 'accept' && verb !== 'refuse' && verb !== 'fulfil') return 'bad_choice';
      if (verb === 'accept') return findRequest(state, cmd.lord, id, (r) => !r.accepted) ? null : 'no_request';
      if (verb === 'refuse') return findRequest(state, cmd.lord, id, (r) => !r.accepted) ? null : 'no_request';
      const r = findRequest(state, cmd.lord, id, (q) => requestReady(state, l, q));
      if (r) return null;
      return findRequest(state, cmd.lord, id, () => true) ? (findRequest(state, cmd.lord, id, (q) => q.kind === 'deliver') ? 'cost' : 'not_ready') : 'no_request';
    },
    apply(state, cmd, ctx) {
      const l = state.lords[cmd.lord]!;
      const { verb, id } = parseChoice(cmd.choice);
      if (verb === 'accept') { const r = findRequest(state, cmd.lord, id, (q) => !q.accepted); if (r) r.accepted = true; }
      else if (verb === 'refuse') { const r = findRequest(state, cmd.lord, id, (q) => !q.accepted); if (r) refuseRequest(state, ctx, l, r); }
      else { const r = findRequest(state, cmd.lord, id, (q) => requestReady(state, l, q)); if (r) completeRequest(state, ctx, l, r); }
    },
  },
  startRally: {
    validate(state, cmd) {
      if (alliedLords(state).length === 0) return 'no_ally';
      const p = state.world.pois[cmd.target];
      if (!p || !p.active || !(p.kind === 'bandit_camp' || p.kind === 'lair' || p.kind === 'boss')) return 'bad_target';
      return marches.handlers.march.validate(state, { t: 'march', hero: cmd.hero, troops: cmd.troops, target: { poi: cmd.target }, kind: 'rally' });
    },
    apply(state, cmd, ctx) {
      marches.handlers.march.apply(state, { t: 'march', hero: cmd.hero, troops: cmd.troops, target: { poi: cmd.target }, kind: 'rally' }, ctx);
      const mid = state.heroes[cmd.hero]?.march;
      const m = mid ? state.marches[mid] : undefined;
      if (m) openRally(state, ctx, m, cmd.target, alliedLords(state));
    },
  },
};
