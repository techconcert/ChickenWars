import { describe, expect, it } from 'vitest';
import { FRIENDLY_REP, ALLIED_REP, changeRep, giftRep, lordLentStacks, lordStage, tradeRatioPm, tradeYield } from '@sim/allies';
import type { TickCtx } from '@sim/ctx';
import { BALANCE, ITEMS, LORDS } from '@sim/data/registry';
import type { GameEvent } from '@sim/events';
import { hashState } from '@sim/save/hash';
import type { GameState } from '@sim/state';
import { tickAllies } from '@sim/systems/allies';
import { advance } from '@sim/tick';
import { cityDefence } from '@sim/raids';
import { makeState } from '../helpers/makeState';

const lordOf = (s: GameState, i = 0): string => Object.keys(s.lords).sort()[i]!;
const ctxOf = (): TickCtx => ({ events: [], safeMode: false });
const rejected = (evs: GameEvent[]): string | null => { const e = evs.find((x) => x.t === 'CommandRejected'); return e && e.t === 'CommandRejected' ? e.code : null; };

describe('reputation', () => {
  it('stage thresholds', () => {
    expect(lordStage(-100)).toBe('hostile');
    expect(lordStage(-26)).toBe('hostile');
    expect(lordStage(-25)).toBe('wary');
    expect(lordStage(0)).toBe('wary');
    expect(lordStage(24)).toBe('wary');
    expect(lordStage(25)).toBe('friendly');
    expect(lordStage(64)).toBe('friendly');
    expect(lordStage(65)).toBe('allied');
    expect(lordStage(100)).toBe('allied');
    expect([FRIENDLY_REP, ALLIED_REP]).toEqual([25, 65]);
  });

  it('changeRep clamps to -100..100 and reports the applied delta', () => {
    const s = makeState();
    const id = lordOf(s);
    const ctx = ctxOf();
    expect(changeRep(s, ctx, id, 500)).toBe(100);
    expect(s.lords[id]!.rep).toBe(100);
    expect(changeRep(s, ctx, id, -500)).toBe(-200);
    expect(s.lords[id]!.rep).toBe(-100);
    expect(ctx.events.filter((e) => e.t === 'LordRepChanged')).toHaveLength(2);
  });

  it('decays by 1 per 5 days above the friendly threshold and stops there', () => {
    const s = makeState();
    const id = lordOf(s);
    s.lords[id]!.rep = 27;
    s.lords[lordOf(s, 1)]!.rep = 10;
    for (const l of Object.values(s.lords)) l.nextRequestAt = 1e9; // keep requests (and their penalties) out of this test
    for (let i = 0; i < 600 * 5 + 5; i++) advance(s, []);
    expect(s.lords[id]!.rep).toBe(26);
    expect(s.lords[lordOf(s, 1)]!.rep).toBe(10);
    for (let i = 0; i < 600 * 15; i++) advance(s, []);
    expect(s.lords[id]!.rep).toBe(25);
  });
});

describe('gifts', () => {
  it('liked resources earn more than disliked ones, and gifts diminish within a day', () => {
    const s = makeState();
    const id = lordOf(s);
    const like = LORDS[id]!.likes[0]!;
    const dislike = LORDS[id]!.dislikes[0]!;
    s.resources[like] = 1000; s.resources[dislike] = 1000;
    const liked = giftRep(s, id, { [like]: 100 });
    const disliked = giftRep(s, id, { [dislike]: 100 });
    expect(liked).toBeGreaterThan(disliked);
    const evs = advance(s, [{ t: 'allyGift', lord: id, gift: { [like]: 100 } }]);
    expect(rejected(evs)).toBeNull();
    expect(s.lords[id]!.rep).toBe(liked);
    expect(s.quests.counters.giftGiven).toBe(1);
    const second = giftRep(s, id, { [like]: 100 });
    expect(second).toBeLessThan(liked);
    advance(s, [{ t: 'allyGift', lord: id, gift: { [like]: 100 } }]);
    expect(s.lords[id]!.rep).toBe(liked + second);
    s.season.day += 1;
    expect(giftRep(s, id, { [like]: 100 })).toBe(liked);
  });

  it('rejects bad gifts', () => {
    const s = makeState();
    const id = lordOf(s);
    expect(rejected(advance(s, [{ t: 'allyGift', lord: 'nobody', gift: { wood: 1 } }]))).toBe('unknown_lord');
    expect(rejected(advance(s, [{ t: 'allyGift', lord: id, gift: {} }]))).toBe('bad_gift');
    expect(rejected(advance(s, [{ t: 'allyGift', lord: id, gift: { wood: 99999 } }]))).toBe('cost');
  });
});

describe('trade ratios', () => {
  it('hostile refuses, wary 1:1 once per day, friendly better with several trades, allied best', () => {
    const s = makeState();
    const id = lordOf(s, 3);
    const like = LORDS[id]!.likes.find((r) => r !== 'ember' && r !== 'stone' && r !== 'wood')!;
    const dislike = LORDS[id]!.dislikes.find((r) => r !== 'ember' && r !== 'stone' && r !== 'wood')!;
    s.resources.stone = 5000; s.resources.wood = 100;
    s.lords[id]!.rep = -50;
    expect(rejected(advance(s, [{ t: 'allyTrade', lord: id, give: 'stone', get: 'wood' }]))).toBe('hostile');
    s.lords[id]!.rep = 0;
    expect(tradeRatioPm(s, id, 'stone')).toBe(1000);
    expect(tradeYield(s, id, 'stone')).toBe(100);
    const w0 = s.resources.wood;
    expect(rejected(advance(s, [{ t: 'allyTrade', lord: id, give: 'stone', get: 'wood' }]))).toBeNull();
    expect(s.resources.wood - w0).toBeGreaterThanOrEqual(100);
    expect(rejected(advance(s, [{ t: 'allyTrade', lord: id, give: 'stone', get: 'wood' }]))).toBe('cooldown');
    s.season.day += 1;
    expect(rejected(advance(s, [{ t: 'allyTrade', lord: id, give: 'stone', get: 'wood' }]))).toBeNull();
    s.lords[id]!.rep = 25;
    expect(tradeRatioPm(s, id, 'stone')).toBe(1250);
    s.lords[id]!.rep = 64;
    expect(tradeRatioPm(s, id, 'stone')).toBeGreaterThan(1400);
    s.lords[id]!.rep = 70;
    expect(tradeRatioPm(s, id, 'stone')).toBe(1500);
    expect(tradeRatioPm(s, id, like)).toBe(1550);
    expect(tradeRatioPm(s, id, dislike)).toBe(1450);
    s.lords[id]!.rep = 30;
    s.season.day += 1;
    for (let i = 0; i < 3; i++) expect(rejected(advance(s, [{ t: 'allyTrade', lord: id, give: 'stone', get: 'wood' }]))).toBeNull();
    expect(rejected(advance(s, [{ t: 'allyTrade', lord: id, give: 'stone', get: 'wood' }]))).toBe('cooldown');
  });

  it('clan trade steps improve the ratio', () => {
    const a = makeState({ options: { clan: 'riverfolk' } });
    const b = makeState({ options: { clan: 'oakwarden' } });
    const id = lordOf(a, 3);
    expect(tradeRatioPm(a, id, 'stone')).toBe(tradeRatioPm(b, id, 'stone') + 100);
  });
});

describe('stage perks', () => {
  it('friendly reveals the region; allied lends troops, shares vision and unlocks hooks', () => {
    const s = makeState();
    const id = lordOf(s);
    const village = s.world.pois[s.lords[id]!.poi]!;
    const regionCells = s.world.regionOf.map((r, i) => (r === village.region ? i : -1)).filter((i) => i >= 0);
    expect(regionCells.some((c) => s.world.fog[c] === 0)).toBe(true);
    s.lords[id]!.rep = 30;
    const evs = advance(s, []);
    expect(evs.some((e) => e.t === 'LordStageChanged' && e.stage === 'friendly')).toBe(true);
    expect(regionCells.every((c) => (s.world.fog[c] ?? 0) >= 1)).toBe(true);
    expect(lordLentStacks(s)).toEqual([]);
    const before = cityDefence(s).power;
    s.lords[id]!.rep = 70;
    const evs2 = advance(s, []);
    expect(evs2.filter((e) => e.t === 'LordPerk').map((e) => (e.t === 'LordPerk' ? e.perk : ''))).toEqual(['lendTroops', 'sharedVision', 'heroOffer', 'uniqueTech']);
    expect(s.quests.counters[`heroOffer_${id}`]).toBe(1);
    expect(lordLentStacks(s).length).toBeGreaterThan(0);
    expect(cityDefence(s).power).toBeGreaterThan(before);
  });

  it('friendly lords send a seasonal gift', () => {
    const s = makeState();
    const id = lordOf(s);
    s.lords[id]!.rep = 40;
    const like = LORDS[id]!.likes[0]!;
    s.resources[like] = 0;
    s.tick = 600 * 20; s.season.day = 19; s.season.dayOfSeason = 19;
    const evs = advance(s, []);
    expect(evs.some((e) => e.t === 'SeasonChanged')).toBe(true);
    const gift = evs.find((e) => e.t === 'LordGift' && e.kind === 'seasonal');
    expect(gift).toBeDefined();
    expect(s.resources[like]).toBeGreaterThanOrEqual(BALANCE.allies.seasonGift.friendly);
  });

  it('clearing a camp near a village earns reputation', () => {
    const s = makeState();
    const id = lordOf(s);
    const v = s.world.pois[s.lords[id]!.poi]!;
    s.world.pois.cx = { ...v, id: 'cx', kind: 'bandit_camp', tier: 1, lordId: undefined, active: false, troops: [], strength: 100, raidReadyAt: 0, respawnAt: 99999 };
    const ctx = ctxOf();
    ctx.events.push({ t: 'CampCleared', tick: s.tick, poi: 'cx', tier: 1 });
    tickAllies(s, ctx);
    expect(s.lords[id]!.rep).toBeGreaterThanOrEqual(BALANCE.allies.clearCampRep);
  });
});

describe('requests', () => {
  function daysState(seed = 1337, days = 10): GameState {
    const s = makeState({ seed });
    for (let i = 0; i < days * 600 + 1; i++) advance(s, []);
    return s;
  }

  it('are posted every 1 to 3 days, deterministically, with expiry', () => {
    const a = daysState();
    const b = daysState();
    expect(hashState(a)).toBe(hashState(b));
    const posted = a.log.filter((e) => e.t === 'RequestPosted' || e.t === 'RequestExpired');
    const all = Object.values(a.lords).flatMap((l) => l.requests);
    expect(all.length + posted.filter((e) => e.t === 'RequestExpired').length).toBeGreaterThan(0);
    for (const l of Object.values(a.lords)) {
      expect(l.requests.length).toBeLessThanOrEqual(BALANCE.allies.requestsMax);
      for (const r of l.requests) expect(r.expiresAt).toBeGreaterThan(a.tick);
      expect(l.nextRequestAt).toBeGreaterThan(0);
    }
    const other = daysState(99);
    expect(JSON.stringify(Object.values(other.lords).map((l) => l.requests.map((r) => r.template)))).not.toBe('');
  });

  it('expire, and ignoring an urgent one costs 5 reputation', () => {
    const s = makeState();
    const id = lordOf(s);
    s.lords[id]!.rep = 10;
    s.lords[id]!.requests.push({ id: 'rq_u', kind: 'defend', data: {}, expiresAt: 100, urgent: true, template: 'req_defend_village', postedAt: 0, accepted: false });
    s.lords[id]!.requests.push({ id: 'rq_n', kind: 'deliver', data: { res: 'wood', amount: 99999 }, expiresAt: 100, urgent: false, template: 'req_deliver_wood', postedAt: 0, accepted: false });
    s.tick = 100;
    const evs = advance(s, []);
    expect(evs.filter((e) => e.t === 'RequestExpired')).toHaveLength(2);
    expect(s.lords[id]!.requests).toHaveLength(0);
    expect(s.lords[id]!.rep).toBe(5);
  });

  it('refusing three in a row costs 10; accepted urgent requests do not cost rep when they expire', () => {
    const s = makeState();
    const id = lordOf(s);
    s.lords[id]!.rep = 20;
    for (let i = 0; i < 3; i++) s.lords[id]!.requests.push({ id: `rq_${i}`, kind: 'deliver', data: { res: 'wood', amount: 10 }, expiresAt: 99999, urgent: false, template: 'req_deliver_wood', postedAt: 0 });
    for (let i = 0; i < 3; i++) advance(s, [{ t: 'allyRequest', lord: id, choice: `refuse:rq_${i}` }]);
    expect(s.lords[id]!.rep).toBe(10);
    expect(s.lords[id]!.refusedStreak).toBe(0);
    s.lords[id]!.requests.push({ id: 'rq_a', kind: 'defend', data: {}, expiresAt: s.tick + 3, urgent: true, template: 'req_defend_village', postedAt: 0 });
    advance(s, [{ t: 'allyRequest', lord: id, choice: 'accept' }]);
    for (let i = 0; i < 5; i++) advance(s, []);
    expect(s.lords[id]!.requests).toHaveLength(0);
    expect(s.lords[id]!.rep).toBe(10);
  });

  it('delivering pays resources for the reward and reputation; fulfilling too early is refused', () => {
    const s = makeState();
    const id = lordOf(s);
    s.lords[id]!.requests.push({ id: 'rq_d', kind: 'deliver', data: { res: 'wood', amount: 200 }, expiresAt: 99999, urgent: false, template: 'req_deliver_wood', postedAt: 0 });
    s.resources.wood = 100;
    expect(rejected(advance(s, [{ t: 'allyRequest', lord: id, choice: 'fulfil' }]))).toBe('cost');
    s.resources.wood = 300;
    const gold = s.resources.gold;
    const evs = advance(s, [{ t: 'allyRequest', lord: id, choice: 'fulfil:rq_d' }]);
    expect(rejected(evs)).toBeNull();
    expect(evs.some((e) => e.t === 'RequestFulfilled')).toBe(true);
    expect(s.resources.wood).toBeLessThanOrEqual(110);
    expect(s.resources.gold).toBeGreaterThanOrEqual(gold + 40);
    expect(s.lords[id]!.rep).toBe(6);
    expect(s.quests.counters.requestsDone).toBe(1);
  });

  it('a clear-camp request completes when the camp is cleared', () => {
    const s = makeState();
    const id = lordOf(s);
    const v = s.world.pois[s.lords[id]!.poi]!;
    s.world.pois.cc = { ...v, id: 'cc', kind: 'bandit_camp', tier: 1, lordId: undefined, active: true, troops: [], strength: 100, raidReadyAt: 0, respawnAt: null };
    s.lords[id]!.requests.push({ id: 'rq_c', kind: 'clearCamp', data: { tier: 1, camp: 'cc' }, expiresAt: 99999, urgent: false, template: 'req_clear_camp', postedAt: 0 });
    advance(s, []);
    expect(s.lords[id]!.requests).toHaveLength(1);
    s.world.pois.cc!.active = false;
    advance(s, []);
    expect(s.lords[id]!.requests).toHaveLength(0);
    expect(s.lords[id]!.rep).toBeGreaterThanOrEqual(10);
  });
});

describe('lord gifts to the player', () => {
  it('friendly and allied lords send gifts of what they like every few days (growing with the Town Hall), neutral ones rarely, hostile never', () => {
    const run = (rep: number, th: number, days: number): { gifts: number; total: number } => {
      const s = makeState();
      const id = lordOf(s);
      s.lords[id]!.rep = rep;
      s.city.buildings[s.city.townHall]!.level = th;
      let gifts = 0, total = 0;
      for (let d = 1; d <= days; d++) {
        s.tick = d * 600;
        s.season.day = d;
        s.season.dayOfSeason = d % 20;
        const ev = advance(s, []);
        for (const e of ev) if (e.t === 'LordGift' && e.kind === 'periodic' && e.lord === id) { gifts++; total += Object.values(e.gift).reduce((a, b) => a + (b ?? 0), 0); }
      }
      return { gifts, total };
    };
    const allied = run(70, 3, 20), friendly = run(40, 3, 20), neutral = run(5, 3, 28), hostile = run(-60, 3, 28);
    expect(allied.gifts).toBeGreaterThanOrEqual(4);
    expect(friendly.gifts).toBeGreaterThanOrEqual(2);
    expect(allied.gifts).toBeGreaterThan(friendly.gifts);
    expect(neutral.gifts).toBeGreaterThanOrEqual(1);
    expect(hostile.gifts).toBe(0);
    expect(run(40, 10, 20).total).toBeGreaterThan(friendly.total);
  });
});

describe('lord gifts: rare items', () => {
  it('allied lords sometimes include a piece of gear that lands in the inventory; hostile never', () => {
    const s = makeState();
    const id = lordOf(s);
    s.lords[id]!.rep = 80;
    s.city.buildings[s.city.townHall]!.level = 12;
    let items = 0;
    for (let d = 1; d <= 400; d++) {
      s.tick = d * 600; s.season.day = d; s.season.dayOfSeason = d % 20;
      const before = Object.keys(s.inventory).length;
      for (const e of advance(s, [])) if (e.t === 'LordGift' && e.lord === id && e.kind === 'periodic' && e.item) { items++; expect(Object.keys(s.inventory).length).toBeGreaterThan(before); expect(ITEMS[e.item]).toBeDefined(); }
      s.lords[id]!.rep = 80; // keep the lord allied while time passes
    }
    expect(items).toBeGreaterThanOrEqual(5);
    expect(items).toBeLessThan(80);
  });
});
