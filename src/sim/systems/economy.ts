import { FP, TICKS_PER_MINUTE } from '../constants';
import type { CommandOf } from '../commands';
import { emit } from '../ctx';
import type { Handler, TickCtx } from '../ctx';
import { BALANCE, effectsAt } from '../data/registry';
import type { GameState } from '../state';
import { getCaps } from '../city/caps';
import { RES_KEYS } from '../city/cost';
import { tradeSteps } from '../city/modifiers';
import { getPopulation } from '../city/pop';
import { computeProduction, fpForTick, getRates, upkeepPerMinute } from '../city/production';
import { sortedKeys } from '../util';
import { tickTraders } from './traders';

export { getCaps, getPopulation, getRates };
export type { RateInfo, RateParts } from '../city/production';
export { upkeepPerMinute };

/** Building type whose presence gates `marketTrade` (see decision D33). */
export const MARKET_BUILDING = 'market';
/** Highest level of a completed market, 0 when none is built yet. */
export function marketLevel(state: GameState): number {
  let best = 0;
  for (const id of sortedKeys(state.city.buildings)) {
    const b = state.city.buildings[id];
    if (b && b.type === MARKET_BUILDING && b.level > best) best = b.level;
  }
  return best;
}
/** Max amount of one resource given in a single trade (0 without a market). */
export function tradeLimitFor(state: GameState): number {
  const lvl = marketLevel(state);
  let n = 0;
  for (const e of effectsAt(MARKET_BUILDING, 'tradeLimit', lvl)) n = Math.max(n, e.amount);
  return n;
}
/** Ticks left before `give` can be traded again (0 = ready). */
export function tradeCooldownLeft(state: GameState, give: string): number {
  const last = state.city.market[give as keyof typeof state.city.market];
  if (last === undefined) return 0;
  return Math.max(0, BALANCE.marketCooldownTicks - (state.tick - last));
}
/** Trade ratio as [get, give]: 2:3 base, one clan step 4:5, two steps 5:6. */
export function tradeRatio(state: GameState): [number, number] {
  const s = Math.max(0, Math.min(2, tradeSteps(state)));
  return s === 0 ? [2, 3] : s === 1 ? [4, 5] : [5, 6];
}

export const handlers: { [K in 'marketTrade' | 'debugGrant']: Handler<CommandOf<K>> } = {
  /** Debug aid (town view button): adds `amount` of every resource, ignoring storage caps. Marks the game as `flags.cheated`. */
  debugGrant: {
    validate: (_state, cmd) => (Number.isInteger(cmd.amount) && cmd.amount > 0 && cmd.amount <= 100000 ? null : 'bad_amount'),
    apply(state, cmd) {
      for (const r of RES_KEYS) state.resources[r] += cmd.amount;
      state.flags.cheated = true;
    },
  },
  marketTrade: {
    validate(state, cmd) {
      if (marketLevel(state) < 1) return 'locked';
      if (!RES_KEYS.includes(cmd.give) || !RES_KEYS.includes(cmd.get) || cmd.give === cmd.get) return 'bad_trade';
      if (cmd.give === 'ember' || cmd.get === 'ember') return 'bad_trade';
      if (!Number.isInteger(cmd.amount) || cmd.amount <= 0) return 'bad_amount';
      if (state.resources[cmd.give] < cmd.amount) return 'cost';
      if (cmd.amount > tradeLimitFor(state)) return 'over_limit';
      const last = state.city.market[cmd.give];
      if (last !== undefined && state.tick - last < BALANCE.marketCooldownTicks) return 'cooldown';
      const [n, d] = tradeRatio(state);
      if (Math.floor((cmd.amount * n) / d) < 1) return 'bad_amount';
      if (state.resources[cmd.get] >= getCaps(state)[cmd.get]) return 'cap_full';
      return null;
    },
    apply(state, cmd) {
      const [n, d] = tradeRatio(state);
      const got = Math.floor((cmd.amount * n) / d);
      state.resources[cmd.give] -= cmd.amount;
      state.resources[cmd.get] = Math.min(getCaps(state)[cmd.get], state.resources[cmd.get] + got);
      state.city.market[cmd.give] = state.tick;
    },
  },
};

/** Day-boundary check used by the starvation timer. */
const starveEvery = (): number => BALANCE.starvation.intervalTicks;

/** Production, upkeep, caps, starvation and warnings (one tick). */
export function tickEconomy(state: GameState, ctx: TickCtx, ticks = 1): void {
  // ticks > 1 is the offline fast-forward: one call stands for `ticks` ticks ending at state.tick (rates x ticks, same caps and starvation rules)
  if (ticks === 1 || state.tick % BALANCE.traders.intervalTicks === 0) tickTraders(state, ctx);
  const caps = getCaps(state);
  const prod = computeProduction(state);
  const upkeepPm = upkeepPerMinute(state);
  const fpOf = (perMinute: number): number => (ticks === 1 ? fpForTick(perMinute, state.tick) : Math.round((perMinute * FP * ticks) / TICKS_PER_MINUTE));
  const upkeepFp = fpOf(upkeepPm);
  let starved = false;
  for (const r of RES_KEYS) {
    const delta = fpOf(prod.perMinute[r]) - (r === 'food' ? upkeepFp : 0);
    const before = state.resources[r];
    const cap = caps[r];
    const total = state.accum[r] + delta;
    const whole = Math.floor(total / FP);
    let rem = total - whole * FP;
    let value = before + whole;
    if (value < 0) {
      value = 0;
      rem = 0;
      if (r === 'food') starved = true;
    } else if (r === 'food' && value === 0 && delta < 0) {
      starved = true;
    }
    if (whole >= 0 && before >= cap) {
      value = before;
      rem = 0;
    } else if (value >= cap) {
      // First tick the stock is full: `lost` is what did not fit (may be 0 when it filled exactly).
      emit(ctx, { t: 'ResourceOverflow', tick: state.tick, res: r, lost: value - cap });
      value = cap;
      rem = 0;
    }
    state.resources[r] = value;
    state.accum[r] = rem;
    if (r === 'food') foodWarnings(state, ctx, before, value, cap, upkeepPm > 0);
  }
  const every = starveEvery();
  const crossed = ticks === 1 ? state.tick % every === 0 : Math.floor(state.tick / every) > Math.floor((state.tick - ticks) / every);
  if (starved && state.tick > 0 && crossed) desert(state, ctx);
}

function foodWarnings(state: GameState, ctx: TickCtx, before: number, after: number, cap: number, eating: boolean): void {
  if (!eating) return;
  if (after === 0 && before > 0) { emit(ctx, { t: 'Starvation', tick: state.tick, level: 'empty' }); return; }
  const warn = Math.floor(cap * 0.2);
  if (after > 0 && before >= warn && after < warn) emit(ctx, { t: 'Starvation', tick: state.tick, level: 'warning' });
}

function desert(state: GameState, ctx: TickCtx): void {
  const pct = BALANCE.starvation.desertPct;
  let lost = 0;
  for (const id of sortedKeys(state.troops)) {
    const p = state.troops[id];
    if (!p) continue;
    for (const k of ['healthy', 'wounded'] as const) {
      if (p[k] <= 0) continue;
      const n = Math.min(p[k], Math.max(1, Math.ceil((p[k] * pct) / 100)));
      p[k] -= n;
      lost += n;
    }
  }
  if (lost > 0) emit(ctx, { t: 'Starvation', tick: state.tick, level: 'desertion' });
}
