// Traders (docs/systems/economy.md, D37): troops of role `trader` stationed at the Trading Post trade stock with every
// non-hostile lord on their own. The player only chooses the target mix of food, wood, stone and gold (`city.trade.weights`).
import { emit } from '../ctx';
import type { Handler, TickCtx } from '../ctx';
import type { CommandOf } from '../commands';
import { getCaps } from '../city/caps';
import { BALANCE, TROOPS, effectsAt } from '../data/registry';
import { tradeRatioPm } from '../allies/lords';
import type { GameState, Res, ResourceId } from '../state';
import { sortedKeys } from '../util';

export const TRADE_RES = ['food', 'wood', 'stone', 'gold'] as const;
export type TradeRes = (typeof TRADE_RES)[number];
export type TradeWeights = Record<TradeRes, number>;
export const TRADING_POST = 'trading_post';

export const defaultTrade = (): NonNullable<GameState['city']['trade']> => ({ on: true, weights: { food: 25, wood: 25, stone: 25, gold: 25 } });

export function tradeState(state: GameState): NonNullable<GameState['city']['trade']> {
  state.city.trade ??= defaultTrade();
  return state.city.trade;
}

/** Highest level of a completed Trading Post (0 when none). */
export function postLevel(state: GameState): number {
  let best = 0;
  for (const id of sortedKeys(state.city.buildings)) {
    const b = state.city.buildings[id];
    if (b && b.type === TRADING_POST && b.level > best) best = b.level;
  }
  return best;
}

/** Traders the post can field. */
export function traderCap(state: GameState): number {
  let n = 0;
  for (const e of effectsAt(TRADING_POST, 'traderCap', postLevel(state))) n = Math.max(n, e.count);
  return n;
}

/** Healthy traders at home, limited by the post's capacity. */
export function activeTraders(state: GameState): number {
  let n = 0;
  for (const id of sortedKeys(state.troops)) if (TROOPS[id]?.role === 'trader') n += state.troops[id]?.healthy ?? 0;
  return Math.min(n, traderCap(state));
}

/** Best partner lord and permille rate for giving `res` (null when every lord is hostile or none exist). */
export function bestPartner(state: GameState, res: ResourceId): { lord: string; pm: number } | null {
  let best: { lord: string; pm: number } | null = null;
  for (const id of sortedKeys(state.lords)) {
    const pm = tradeRatioPm(state, id, res);
    if (pm > 0 && (!best || pm > best.pm)) best = { lord: id, pm };
  }
  return best;
}

/** Plans one cycle: what to give and get, or null when nothing is worth moving. Pure; used by the tick and the UI preview. */
export function planTrade(state: GameState): { lord: string; give: Res; get: Res } | null {
  const t = tradeState(state);
  const n = activeTraders(state);
  if (!t.on || n <= 0) return null;
  const wsum = TRADE_RES.reduce((a, r) => a + t.weights[r], 0);
  if (wsum <= 0) return null;
  const caps = getCaps(state);
  const total = TRADE_RES.reduce((a, r) => a + state.resources[r], 0);
  const surplus: Partial<Record<TradeRes, number>> = {};
  const deficit: Partial<Record<TradeRes, number>> = {};
  let S = 0, D = 0;
  for (const r of TRADE_RES) {
    const target = (total * t.weights[r]) / wsum;
    const diff = state.resources[r] - target;
    if (diff >= 1) { surplus[r] = Math.floor(diff); S += Math.floor(diff); }
    else if (diff <= -1) { const d = Math.min(Math.floor(-diff), Math.floor(caps[r] - state.resources[r])); if (d > 0) { deficit[r] = d; D += d; } }
  }
  if (S < 1 || D < 1) return null;
  const vol = Math.min(n * BALANCE.traders.loadPerTrader, S);
  const give: Res = {};
  let yieldTotal = 0;
  let lord = '';
  let lordPm = 0;
  for (const r of TRADE_RES) {
    const have = surplus[r];
    if (!have) continue;
    const partner = bestPartner(state, r);
    if (!partner) continue;
    const amt = Math.floor((vol * have) / S);
    if (amt < 1) continue;
    give[r] = amt;
    yieldTotal += (amt * partner.pm * BALANCE.traders.commission) / 1000;
    if (partner.pm > lordPm) { lordPm = partner.pm; lord = partner.lord; }
  }
  if (yieldTotal < 1) return null;
  const k = Math.min(1, D / yieldTotal);
  const get: Res = {};
  let paid = 0;
  for (const r of TRADE_RES) if (give[r]) { give[r] = Math.floor((give[r] ?? 0) * k); paid += give[r] ?? 0; }
  if (paid < 1) return null;
  const got = Math.min(D, Math.floor(yieldTotal * k));
  for (const r of TRADE_RES) { const d = deficit[r]; if (d) get[r] = Math.floor((got * d) / D); }
  if (!Object.values(get).some((v) => (v ?? 0) > 0)) return null;
  return { lord, give, get };
}

/** Called from the economy tick: runs one trading cycle every `traders.intervalTicks`. */
export function tickTraders(state: GameState, ctx: TickCtx): void {
  if (state.tick % BALANCE.traders.intervalTicks !== 0) return;
  const plan = planTrade(state);
  if (!plan) return;
  for (const r of TRADE_RES) {
    state.resources[r] -= plan.give[r] ?? 0;
    state.resources[r] += plan.get[r] ?? 0;
  }
  tradeState(state).last = { tick: state.tick, lord: plan.lord, give: plan.give, get: plan.get };
  emit(ctx, { t: 'TradersTraded', tick: state.tick, lord: plan.lord, give: plan.give, get: plan.get });
}

export const handlers: { [K in 'setTrade']: Handler<CommandOf<K>> } = {
  setTrade: {
    validate(state, cmd) {
      if (postLevel(state) < 1) return 'locked';
      let sum = 0;
      for (const r of TRADE_RES) {
        const w = cmd.weights[r];
        if (!Number.isInteger(w) || w < 0 || w > 100) return 'bad_amount';
        sum += w;
      }
      if (cmd.on && sum <= 0) return 'bad_amount';
      return null;
    },
    apply(state, cmd) {
      const t = tradeState(state);
      t.on = cmd.on;
      t.weights = { food: cmd.weights.food, wood: cmd.weights.wood, stone: cmd.weights.stone, gold: cmd.weights.gold };
    },
  },
};
