// World system (docs/systems/world.md): node respawn and regrowth, fog of war, seeded world events.
// Region unlocking after a boss kill is done by the combat system (RegionUnlocked).
import { DAY_TICKS } from '../constants';
import type { CommandOf } from '../commands';
import { emit } from '../ctx';
import type { Handler, TickCtx } from '../ctx';
import { BALANCE, EVENTS, EVENTS_DATA, EVENT_LIST, WORLD } from '../data/registry';
import { eventBandForTh, eventBandOfId } from './eventGen';
import { EVENT_EXPIRE_TICKS, FOG_INTERVAL_TICKS, NODE_REGROW_TICKS, NODE_RESPAWN_FRACTION, cellDistance, gridFor } from '../nav';
import { recomputeFog } from '../nav/fog';
import { depositResources } from '../nav/marchCore';
import { hashRand } from '../rng';
import type { GameState, Res, ResourceId } from '../state';
import { sortedKeys } from '../util';
import { seededCellNear, spawnCampNear } from '../worldgen/spawn';
import { seasonId } from './seasons';

type WorldEventDef = (typeof EVENT_LIST)[number];
type EventEffectDef = WorldEventDef['options'][number]['effect'][number];

/** Node respawn and regrowth; `ticks` > 1 is the offline fast-forward (one call stands for that many ticks). */
export function tickNodes(state: GameState, ticks = 1): void {
  const regrow = ticks > 1 || state.tick % FOG_INTERVAL_TICKS === 0;
  for (const id of sortedKeys(state.world.nodes)) {
    const n = state.world.nodes[id]!;
    if (n.respawnAt !== null) {
      if (state.tick >= n.respawnAt) {
        n.amount = Math.floor(n.maxAmount * NODE_RESPAWN_FRACTION);
        n.respawnAt = null;
        n.gatherer = null;
      }
      continue;
    }
    if (regrow && !n.gatherer && n.amount > 0 && n.amount < n.maxAmount) {
      const step = Math.ceil((n.maxAmount * NODE_RESPAWN_FRACTION * (ticks > 1 ? ticks : FOG_INTERVAL_TICKS)) / NODE_REGROW_TICKS);
      n.amount = Math.min(n.maxAmount, n.amount + step);
    }
  }
}

/** Picks a season-eligible event by weight from hashRand(seed,'event',day): authored events plus generated ones of the player's Town Hall band (or the one below), never one of the last `recent`. */
export function pickEvent(state: GameState, day: number): WorldEventDef | null {
  const season = seasonId(state);
  const th = state.city.buildings[state.city.townHall]?.level ?? 1;
  const band = eventBandForTh(EVENTS_DATA, th);
  const seen = new Set(state.eventSeen ?? []);
  let pool = EVENT_LIST.filter((e) => (!e.season || e.season === season) && !seen.has(e.id) && (eventBandOfId(e.id) === 0 || eventBandOfId(e.id) === band || eventBandOfId(e.id) === band - 1));
  if (!pool.length) pool = EVENT_LIST.filter((e) => !e.season || e.season === season);
  let total = 0;
  for (const e of pool) total += e.weight;
  if (!pool.length) return null;
  let r = hashRand(state.seed, 'event', day, 0) * total;
  for (const e of pool) {
    if (r < e.weight) return e;
    r -= e.weight;
  }
  return pool[pool.length - 1]!;
}

function tickEvents(state: GameState, ctx: TickCtx): void {
  if (state.pendingEvent && state.tick >= state.pendingEvent.expiresAt) state.pendingEvent = null;
  if (state.tick === 0 || state.tick % DAY_TICKS !== 0 || ctx.safeMode || state.pendingEvent) return;
  const day = state.season.day;
  if (day <= 0 || day % BALANCE.eventIntervalDays !== 0) return;
  const ev = pickEvent(state, day);
  if (!ev) return;
  state.pendingEvent = { id: ev.id, expiresAt: state.tick + EVENT_EXPIRE_TICKS };
  state.eventSeen = [...(state.eventSeen ?? []), ev.id].slice(-EVENTS_DATA.recent);
  emit(ctx, { t: 'WorldEventPosted', tick: state.tick, event: ev.id });
}

/** Opens a region next to an open one once the Town Hall reaches its tier's `unlockCityLevel` (the other way in is a boss kill). */
function unlockByTownHall(state: GameState, ctx: TickCtx): void {
  if (state.tick % FOG_INTERVAL_TICKS !== 0) return;
  const th = state.city.buildings[state.city.townHall]?.level ?? 1;
  for (let guard = 0; guard < state.world.regions.length; guard++) {
    let opened = false;
    for (const r of state.world.regions) {
      if (r.unlocked || r.dangerTier > 6) continue;
      const need = WORLD.regionTiers.find((t) => t.tier === r.dangerTier)?.unlockCityLevel;
      if (need === undefined || th < need) continue;
      if (!r.neighbours.some((n) => state.world.regions[n]?.unlocked)) continue;
      r.unlocked = true;
      opened = true;
      emit(ctx, { t: 'RegionUnlocked', tick: state.tick, region: r.id });
    }
    if (!opened) break;
  }
}

export function tickWorld(state: GameState, ctx: TickCtx): void {
  tickNodes(state);
  unlockByTownHall(state, ctx);
  if (state.tick % FOG_INTERVAL_TICKS === 0) {
    const fresh = recomputeFog(state);
    if (fresh > 0) emit(ctx, { t: 'FogRevealed', tick: state.tick, cells: fresh });
  }
  tickEvents(state, ctx);
  if (state.buffs.length && state.buffs.some((b) => b.until <= state.tick)) state.buffs = state.buffs.filter((b) => b.until > state.tick);
}

// ---- event choices

function costOf(e: EventEffectDef): Res {
  if (e.kind === 'trade') return e.give;
  if (e.kind === 'cost') {
    const out: Res = {};
    for (const k of Object.keys(e)) if (k !== 'kind') out[k as ResourceId] = (e as unknown as Record<string, number>)[k] ?? 0;
    return out;
  }
  return {};
}

function applyEffect(state: GameState, ctx: TickCtx, e: EventEffectDef): void {
  const pay = costOf(e);
  for (const k of Object.keys(pay) as ResourceId[]) state.resources[k] = Math.max(0, state.resources[k] - (pay[k] ?? 0));
  switch (e.kind) {
    case 'trade': {
      const { lost } = depositResources(state, e.get);
      for (const k of sortedKeys(lost as Record<string, number>) as ResourceId[]) {
        emit(ctx, { t: 'ResourceOverflow', tick: state.tick, res: k, lost: lost[k] ?? 0 });
      }
      return;
    }
    case 'spawnCamp': {
      const cell = seededCellNear(state, state.world.capitalCell, 6, 14, 'eventcamp');
      spawnCampNear(state, cell, e.tier);
      return;
    }
    case 'blockNode': {
      const g = gridFor(state.world.radius);
      let best: string | null = null;
      let bd = Infinity;
      for (const id of sortedKeys(state.world.nodes)) {
        const n = state.world.nodes[id]!;
        if (n.type !== e.type || n.amount <= 0 || n.respawnAt !== null) continue;
        const d = cellDistance(g, state.world.capitalCell, n.cell);
        if (d < bd) { bd = d; best = id; }
      }
      if (best) state.world.nodes[best]!.blockedUntil = state.tick + e.ticks;
      return;
    }
    case 'gamble': {
      const won = hashRand(state.seed, 'gamble', state.tick, 0) * 100 < e.chance;
      if (won) {
        const { lost } = depositResources(state, e.win);
        for (const k of sortedKeys(lost as Record<string, number>) as ResourceId[]) emit(ctx, { t: 'ResourceOverflow', tick: state.tick, res: k, lost: lost[k] ?? 0 });
      } else {
        for (const k of sortedKeys(e.lose as Record<string, number>) as ResourceId[]) state.resources[k] = Math.max(0, state.resources[k] - (e.lose[k] ?? 0));
      }
      state.chronicle.push({ tick: state.tick, text: won ? 'The gamble paid off.' : 'The gamble failed.' });
      return;
    }
    case 'buff':
      state.buffs.push({ stat: e.stat, pct: e.pct, until: state.tick + e.ticks });
      return;
    default:
      return; // cost: already paid above
  }
}

export const handlers: { [K in 'eventChoice']: Handler<CommandOf<K>> } = {
  eventChoice: {
    validate(state, cmd) {
      const pe = state.pendingEvent;
      if (!pe) return 'no_event';
      const ev = EVENTS[pe.id];
      const opt = ev?.options[cmd.option];
      if (!ev || !opt) return 'bad_option';
      const need: Res = {};
      for (const e of opt.effect) {
        const c = costOf(e);
        for (const k of Object.keys(c) as ResourceId[]) need[k] = (need[k] ?? 0) + (c[k] ?? 0);
      }
      for (const k of Object.keys(need) as ResourceId[]) if (state.resources[k] < (need[k] ?? 0)) return 'cost';
      return null;
    },
    apply(state, cmd, ctx) {
      const pe = state.pendingEvent;
      const ev = pe ? EVENTS[pe.id] : undefined;
      const opt = ev?.options[cmd.option];
      if (!ev || !opt) return;
      for (const e of opt.effect) applyEffect(state, ctx, e);
      state.pendingEvent = null;
      state.chronicle.push({ tick: state.tick, text: `${ev.title}: ${opt.label}.` });
    },
  },
};
