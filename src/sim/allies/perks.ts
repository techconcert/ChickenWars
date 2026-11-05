// Stage perks: region reveal, shared vision, lent troops, seasonal gifts, hero offer and unique tech hooks.
import { cellsWithin, gridFor } from '../nav';
import type { VisionSource } from '../nav/fog';
import { depositResources } from '../nav/marchCore';
import type { TickCtx } from '../ctx';
import { BALANCE, HERO_LIST, ITEM_LIST, LORDS } from '../data/registry';
import type { GameState, Res, Stack } from '../state';
import { hash32, hashRand } from '../rng';
import { sortedKeys } from '../util';
import { STAGE_ORDER, alliedLords, lordStage, stageIndex } from './lords';

/** Radius around an allied village that stays revealed (shared vision). */
export const SHARED_VISION_RADIUS = 6;

function revealRegion(state: GameState, ctx: TickCtx, lordId: string): void {
  const l = state.lords[lordId];
  const poi = l ? state.world.pois[l.poi] : undefined;
  if (!poi) return;
  let n = 0;
  const w = state.world;
  for (let c = 0; c < w.regionOf.length; c++) {
    if (w.regionOf[c] === poi.region && (w.fog[c] ?? 0) === 0) { w.fog[c] = 1; n++; }
  }
  if (n > 0) ctx.events.push({ t: 'FogRevealed', tick: state.tick, cells: n });
}

function revealAround(state: GameState, cell: number, radius: number): void {
  const g = gridFor(state.world.radius);
  for (const c of cellsWithin(g, cell, radius)) if ((state.world.fog[c] ?? 0) === 0) state.world.fog[c] = 1;
}

/** Vision sources of allied villages (for fog consumers; also kept explored by syncStage). */
export function lordVisionSources(state: GameState): VisionSource[] {
  const out: VisionSource[] = [];
  for (const l of alliedLords(state)) {
    const p = state.world.pois[l.poi];
    if (p) out.push({ cell: p.cell, radius: SHARED_VISION_RADIUS });
  }
  return out;
}

/** Percent of an army as stacks (floored per stack). */
export function armyStacks(lordId: string, pct: number): Stack[] {
  const def = LORDS[lordId];
  const out: Stack[] = [];
  if (!def) return out;
  for (const s of def.army) {
    const count = Math.floor((s.count * pct) / 100);
    if (count > 0) out.push({ troop: s.troop, count });
  }
  return out;
}

/** Troops allied lords lend to the city's defence (lendPct of each army). */
export function lordLentStacks(state: GameState): Stack[] {
  const merged: Record<string, number> = {};
  for (const l of alliedLords(state)) for (const s of armyStacks(l.id, BALANCE.allies.lendPct)) merged[s.troop] = (merged[s.troop] ?? 0) + s.count;
  return Object.keys(merged).sort().map((troop) => ({ troop, count: merged[troop]! }));
}

/** Applies perks for each stage newly reached since the last sync and emits LordStageChanged. */
export function syncStage(state: GameState, ctx: TickCtx, lordId: string): void {
  const l = state.lords[lordId];
  if (!l) return;
  const now = lordStage(l.rep);
  const prev = (l.stageSeen as typeof now | undefined) ?? 'wary';
  if (now === prev) { l.stageSeen = now; return; }
  const from = stageIndex(prev);
  const to = stageIndex(now);
  l.stageSeen = now;
  ctx.events.push({ t: 'LordStageChanged', tick: state.tick, lord: lordId, stage: now, from: prev });
  for (let i = from + 1; i <= to; i++) {
    const st = STAGE_ORDER[i];
    if (st === 'friendly') {
      revealRegion(state, ctx, lordId);
      ctx.events.push({ t: 'LordPerk', tick: state.tick, lord: lordId, perk: 'revealRegion' });
    } else if (st === 'allied') {
      const p = state.world.pois[l.poi];
      if (p) revealAround(state, p.cell, SHARED_VISION_RADIUS);
      const hasHero = HERO_LIST.some((h) => h.recruit.kind === 'ally' && h.recruit.lord === lordId);
      if (hasHero) state.quests.counters[`heroOffer_${lordId}`] = 1;
      state.quests.counters[`allyTech_${lordId}`] = 1;
      ctx.events.push({ t: 'LordPerk', tick: state.tick, lord: lordId, perk: 'lendTroops' });
      ctx.events.push({ t: 'LordPerk', tick: state.tick, lord: lordId, perk: 'sharedVision' });
      if (hasHero) ctx.events.push({ t: 'LordPerk', tick: state.tick, lord: lordId, perk: 'heroOffer' });
      ctx.events.push({ t: 'LordPerk', tick: state.tick, lord: lordId, perk: 'uniqueTech', tech: `ally_${lordId}` });
    }
  }
}

/** Seasonal passive gift from friendly+ lords: their liked resources. */
export function seasonalGifts(state: GameState, ctx: TickCtx): void {
  for (const id of sortedKeys(state.lords)) {
    const l = state.lords[id]!;
    const stage = lordStage(l.rep);
    if (stage !== 'friendly' && stage !== 'allied') continue;
    const amount = BALANCE.allies.seasonGift[stage];
    const gift: Res = {};
    for (const r of LORDS[id]?.likes ?? []) gift[r] = amount;
    const { stored } = depositResources(state, gift);
    ctx.events.push({ t: 'LordGift', tick: state.tick, lord: id, gift: stored, kind: 'seasonal' });
  }
}

const NICE = (n: number): number => (n < 50 ? Math.max(5, Math.round(n / 5) * 5) : Math.round(n / 10) * 10);

/**
 * Gifts the lords send on their own: a friendly or allied lord every few days, a neutral one (reputation 0 or better) now and then.
 * They send what they like most (and a little gold from allies), growing with the player's Town Hall. Staggered per lord by a hash of its id.
 */
export function periodicGifts(state: GameState, ctx: TickCtx): void {
  const cfg = BALANCE.allies.gifts;
  const th = state.city.buildings[state.city.townHall]?.level ?? 1;
  const scale = 1 + cfg.thScale * (th - 1);
  for (const id of sortedKeys(state.lords)) {
    const l = state.lords[id]!;
    const stage = lordStage(l.rep);
    if (stage === 'hostile') continue;
    const c = cfg[stage];
    if (l.rep < c.minRep) continue;
    const offset = hash32(state.seed, 'lordGift', 0, id) % c.everyDays;
    if (state.season.day % c.everyDays !== offset) continue;
    const gift: Res = {};
    const amount = NICE(c.base * scale);
    for (const r of LORDS[id]?.likes ?? []) gift[r] = amount;
    if (stage === 'allied') gift.gold = (gift.gold ?? 0) + NICE(amount * 0.5);
    const { stored } = depositResources(state, gift);
    // rarely a piece of gear too: rarity follows the Town Hall (allied lords may give one tier better)
    let item: string | undefined;
    if (hashRand(state.seed, 'lordGiftItem', state.tick, id) < c.itemChance) {
      const order = ['common', 'uncommon', 'rare', 'epic'] as const;
      let tier = th >= 17 ? 3 : th >= 10 ? 2 : th >= 5 ? 1 : 0;
      if (stage === 'allied' && hashRand(state.seed, 'lordGiftTier', state.tick, id) < 0.3) tier = Math.min(3, tier + 1);
      const pool = ITEM_LIST.filter((i) => i.rarity === order[tier]).map((i) => i.id).sort();
      if (pool.length) {
        item = pool[Math.floor(hashRand(state.seed, 'lordGiftPick', state.tick, id) * pool.length)]!;
        const iid = String(state.nextId++);
        state.inventory[iid] = { id: iid, def: item, upgrade: 0 };
      }
    }
    ctx.events.push({ t: 'LordGift', tick: state.tick, lord: id, gift: stored, kind: 'periodic', ...(item ? { item } : {}) });
  }
}
