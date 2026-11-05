// Validates data/*.json: zod schemas (src/sim/data/schema.ts) plus cross-reference and monotonicity checks.
// Usage: `npm run validate`. Also imported by tests/sim/data.test.ts.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { YEAR_DAYS } from '../src/sim/constants';
import { DATA_SCHEMAS } from '../src/sim/data/schema';
import type { DataFile } from '../src/sim/data/schema';
import type { z } from 'zod';
import { costAtLevel, ticksAtLevel } from '../src/sim/util';

const dir = fileURLToPath(new URL('../data/', import.meta.url));

type Parsed = { [F in DataFile]: z.infer<(typeof DATA_SCHEMAS)[F]> };

export function validateAll(): string[] {
  const errors: string[] = [];
  const err = (m: string): void => { errors.push(m); };

  const files = readdirSync(dir).filter((x) => x.endsWith('.json'));
  for (const f of files) if (!(f in DATA_SCHEMAS)) err(`${f}: no schema registered in DATA_SCHEMAS`);
  const parsed: Partial<Parsed> = {};
  for (const f of Object.keys(DATA_SCHEMAS) as DataFile[]) {
    if (!files.includes(f)) { err(`${f}: file missing`); continue; }
    let json: unknown;
    try { json = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch (e) { err(`${f}: invalid JSON (${(e as Error).message})`); continue; }
    const r = DATA_SCHEMAS[f].safeParse(json);
    if (!r.success) for (const i of r.error.issues) err(`${f}: ${i.path.join('.') || '(root)'}: ${i.message}`);
    else (parsed as Record<string, unknown>)[f] = r.data;
  }
  if (errors.length) return errors; // cross checks need well-formed data

  const d = parsed as Parsed;
  const dup = (xs: string[], what: string): void => { const s = new Set<string>(); for (const x of xs) { if (s.has(x)) err(`duplicate ${what} id ${x}`); s.add(x); } };
  const res = new Set(d['resources.json'].map((r) => r.id));
  const buildings = d['buildings.json'];
  const bIds = new Set(buildings.map((b) => b.id));
  const troops = d['troops.json'];
  const tIds = new Set(troops.map((t) => t.id));
  const research = d['research.json'];
  const rIds = new Set(research.map((r) => r.id));
  const skills = new Set(d['skills.json'].map((x) => x.id));
  const quests = d['quests.json'];
  const qIds = new Set(quests.map((q) => q.id));
  const items = d['items.json'];
  const iIds = new Set(items.map((i) => i.id));
  const heroes = d['heroes.json'];
  const hIds = new Set(heroes.map((h) => h.id));
  const world = d['world.json'];
  const poiKinds = new Set(world.poiTypes.map((p) => p.id));
  const nodeTypes = new Set(world.nodeTypes.map((n) => n.id));
  for (const [list, what] of [[buildings, 'building'], [troops, 'troop'], [research, 'research'], [quests, 'quest'], [items, 'item'], [heroes, 'hero'], [d['lords.json'], 'lord'], [d['clans.json'], 'clan'], [d['startTypes.json'], 'startType'], [d['skills.json'], 'skill'], [d['requests.json'], 'request']] as const) {
    dup(list.map((x) => x.id), what);
  }

  // buildings
  for (const b of buildings) {
    for (const e of b.effects) {
      for (const [k, v] of Object.entries(e)) {
        if (!Array.isArray(v)) continue;
        if (v.length !== b.maxLevel) err(`building ${b.id}: effect ${e.kind}.${k} has ${v.length} entries, maxLevel ${b.maxLevel}`);
        for (let i = 1; i < v.length; i++) if ((v[i] as number) < (v[i - 1] as number)) err(`building ${b.id}: ${e.kind}.${k} decreases at level ${i + 1}`);
      }
      if (e.kind === 'trainSpeed' && !troops.some((t) => t.class === e.troopClass && t.building === b.id)) err(`building ${b.id}: trainSpeed class ${e.troopClass} trains no troop`);
    }
    for (let l = 2; l <= b.maxLevel; l++) {
      const a = costAtLevel(b, l - 1);
      const c = costAtLevel(b, l);
      for (const r of Object.keys(c) as (keyof typeof c)[]) if ((c[r] ?? 0) < (a[r] ?? 0)) err(`building ${b.id}: cost.${r} decreases at level ${l}`);
      if (ticksAtLevel(b, l) < ticksAtLevel(b, l - 1)) err(`building ${b.id}: build time decreases at level ${l}`);
    }
    if (typeof b.maxCount !== 'number') for (let i = 1; i < b.maxCount.byTH.length; i++) if ((b.maxCount.byTH[i] ?? 0) < (b.maxCount.byTH[i - 1] ?? 0)) err(`building ${b.id}: maxCount.byTH decreases at TH${i + 1}`);
    for (const q of b.requires ?? []) if (!bIds.has(q.building)) err(`building ${b.id}: unknown required building ${q.building}`);
  }
  if (!bIds.has('town_hall')) err('buildings.json: town_hall missing');

  // troops
  for (const t of troops) {
    if (!bIds.has(t.building)) err(`troop ${t.id}: unknown building ${t.building}`);
    if (t.requiresTech) {
      if (!rIds.has(t.requiresTech)) err(`troop ${t.id}: unknown tech ${t.requiresTech}`);
      else if (!research.find((r) => r.id === t.requiresTech)?.effects.some((e) => e.kind === 'unlockTroop' && e.troop === t.id)) err(`troop ${t.id}: tech ${t.requiresTech} does not unlock it`);
    }
  }

  // research
  // cycle check: does any prerequisite path from `from` lead back to `target`? (visited set only prevents re-walks; diamonds are fine)
  const reaches = (from: string, target: string, visited = new Set<string>()): boolean => {
    for (const q of research.find((r) => r.id === from)?.requires ?? []) {
      if (q === target) return true;
      if (visited.has(q)) continue;
      visited.add(q);
      if (reaches(q, target, visited)) return true;
    }
    return false;
  };
  for (const r of research) {
    for (const q of r.requires) if (!rIds.has(q)) err(`research ${r.id}: unknown prerequisite ${q}`);
    if (reaches(r.id, r.id)) err(`research ${r.id}: prerequisite cycle`);
    if (r.requiresFlag && !(r.requiresFlag.startsWith('allyTech_') && d['lords.json'].some((l) => `allyTech_${l.id}` === r.requiresFlag))) err(`research ${r.id}: requiresFlag ${r.requiresFlag} is not allyTech_<lord>`);
    for (const e of r.effects) if (e.kind === 'unlockTroop' && !tIds.has(e.troop)) err(`research ${r.id}: unknown troop ${e.troop}`);
  }

  // heroes, skills, items, talents
  for (const h of heroes) {
    if (!skills.has(h.skill)) err(`hero ${h.id}: unknown skill ${h.skill}`);
    if (h.recruit.kind === 'quest' && !qIds.has(h.recruit.quest)) err(`hero ${h.id}: unknown recruit quest ${h.recruit.quest}`);
    if (h.recruit.kind === 'ally' && !d['lords.json'].some((l) => l.id === (h.recruit as { lord: string }).lord)) err(`hero ${h.id}: unknown ally lord`);
    if (h.recruit.kind === 'poi' && !poiKinds.has(h.recruit.poi)) err(`hero ${h.id}: unknown recruit poi ${h.recruit.poi}`);
  }
  if (heroes.filter((h) => h.recruit.kind === 'start').length !== 1) err('heroes.json: exactly one hero must have recruit.kind "start"');
  const slotRar = new Set(items.map((i) => `${i.slot}/${i.rarity}`));
  for (const s of ['weapon', 'armour', 'banner', 'trinket']) for (const r of ['common', 'uncommon', 'rare', 'epic']) if (!slotRar.has(`${s}/${r}`)) err(`items.json: no ${r} ${s}`);
  const nodeIds = new Set<string>();
  const trees = d['talents.json'];
  for (const cls of ['warrior', 'ranger', 'strategist']) if (!trees.some((t) => t.id === cls)) err(`talents.json: missing tree ${cls}`);
  for (const h of heroes) if (!trees.some((t) => t.id === h.class)) err(`hero ${h.id}: no talent tree for class ${h.class}`);
  for (const t of trees) {
    const ids = new Set(t.nodes.map((n) => n.id));
    for (const n of t.nodes) {
      if (nodeIds.has(n.id)) err(`talent ${n.id}: duplicate id`);
      nodeIds.add(n.id);
      for (const r of n.requires.nodes ?? []) if (!ids.has(r)) err(`talent ${n.id}: requires unknown node ${r} (must be in tree ${t.id})`);
    }
    if (!t.nodes.some((n) => n.effects.some((e) => e.kind === 'skillRank'))) err(`talent tree ${t.id}: no skillRank node`);
    for (const tier of [1, 2, 3, 4]) if (!t.nodes.some((n) => n.tier === tier)) err(`talent tree ${t.id}: no tier ${tier} node`);
  }

  // quests
  for (const q of quests) {
    if (q.next && !qIds.has(q.next)) err(`quest ${q.id}: unknown next ${q.next}`);
    if (q.rewards.item && !iIds.has(q.rewards.item)) err(`quest ${q.id}: unknown reward item ${q.rewards.item}`);
    if (q.rewards.hero && !hIds.has(q.rewards.hero)) err(`quest ${q.id}: unknown reward hero ${q.rewards.hero}`);
    for (const s of q.steps) {
      if ('building' in s && !bIds.has(s.building)) err(`quest ${q.id}: unknown building ${s.building}`);
      if ('troop' in s && !tIds.has(s.troop)) err(`quest ${q.id}: unknown troop ${s.troop}`);
      if (s.kind === 'buildingLevel') { const mx = buildings.find((b) => b.id === s.building)?.maxLevel ?? 0; if (s.level > mx) err(`quest ${q.id}: level ${s.level} above max ${mx}`); }
    }
  }
  if (quests[0]) {
    const seen = new Set<string>();
    for (let q: typeof quests[number] | undefined = quests[0]; q; q = q.next ? quests.find((x) => x.id === q?.next) : undefined) {
      if (seen.has(q.id)) { err(`quest chain loops at ${q.id}`); break; }
      seen.add(q.id);
    }
    for (const q of quests) if (!seen.has(q.id) && !q.trigger) err(`quest ${q.id}: not reachable from the first quest (side quests need a trigger)`);
  }

  // world
  for (const c of world.banditCamps) for (const t of c.troops) if (!tIds.has(t.troop)) err(`camp tier ${c.tier}: unknown troop ${t.troop}`);
  for (const b of world.bosses) for (const t of b.troops) if (!tIds.has(t.troop)) err(`boss ${b.id}: unknown troop ${t.troop}`);
  for (let i = 1; i < world.banditCamps.length; i++) if ((world.banditCamps[i]?.baseStrength ?? 0) < (world.banditCamps[i - 1]?.baseStrength ?? 0)) err('world.banditCamps: baseStrength not increasing by tier');
  for (const c of world.banditCamps) if (c.raidThreshold > c.tierCap || c.baseStrength > c.tierCap) err(`camp tier ${c.tier}: thresholds exceed tierCap`);
  for (const e of world.events) for (const o of e.options) for (const f of o.effect) {
    if (f.kind === 'blockNode' && !nodeTypes.has(f.type)) err(`event ${e.id}: unknown node type ${f.type}`);
    if (f.kind === 'cost') for (const k of Object.keys(f)) if (k !== 'kind' && !res.has(k as never)) err(`event ${e.id}: unknown resource ${k}`);
  }
  for (const tier of [1, 2, 3, 4, 5]) if (!world.lootTables.some((t) => t.tier === tier)) err(`world.lootTables: missing tier ${tier}`);
  for (const lt of world.lootTables) {
    for (const [k, v] of Object.entries(lt.resources)) if (v[0] > v[1]) err(`lootTables tier ${lt.tier}: ${k} range inverted`);
    for (const r of lt.rare) {
      if (r.kind === 'resource' && r.amount[0] > r.amount[1]) err(`lootTables tier ${lt.tier}: rare ${r.res} range inverted`);
      if (r.kind === 'item' && !items.some((i) => i.rarity === r.rarity && i.source.includes('camp') ) && lt.tier <= 2) err(`lootTables tier ${lt.tier}: no camp item of rarity ${r.rarity}`);
      if (r.kind === 'item' && !items.some((i) => i.rarity === r.rarity)) err(`lootTables tier ${lt.tier}: no item of rarity ${r.rarity}`);
    }
  }
  const ls = d['balance.json'].lootScaling;
  if (ls.minMult > ls.maxMult || ls.minMult <= 0) err('balance.lootScaling: need 0 < minMult <= maxMult');

  // bounties: template references and band ranges
  const bnt = d['bounties.json'];
  if (!qIds.has(bnt.startAfter)) err(`bounties: startAfter ${bnt.startAfter} is not a quest`);
  dup(bnt.templates.map((t) => t.id), 'bounty template');
  for (const t of bnt.templates) {
    const st = t.step as Record<string, unknown>;
    if (typeof st['troop'] === 'string' && !tIds.has(st['troop'])) err(`bounty ${t.id}: unknown troop ${st['troop']}`);
    if (typeof st['key'] === 'string' && /^upgraded_/.test(st['key']) && st['key'] !== 'upgraded_total' && !bIds.has(st['key'].slice(9))) err(`bounty ${t.id}: unknown building in ${st['key']}`);
    if (t.bands[0] > t.bands[1] || t.bands[1] > bnt.bands.length) err(`bounty ${t.id}: bad band range`);
  }

  // events: generated event templates reference real resources, nodes and bands
  const evd = d['events.json'];
  dup(evd.templates.map((t) => t.id), 'event template');
  for (const t of evd.templates) {
    if (t.bands[0] > t.bands[1] || t.bands[1] > evd.bands.length) err(`event ${t.id}: bad band range`);
    if (t.node && !nodeTypes.has(t.node)) err(`event ${t.id}: unknown node type ${t.node}`);
  }

  // lords, requests, clans, start types
  for (const l of d['lords.json']) if (l.likes.some((x) => l.dislikes.includes(x))) err(`lord ${l.id}: likes and dislikes overlap`);
  for (const r of d['requests.json']) if (r.reward.item && !iIds.has(r.reward.item)) err(`request ${r.id}: unknown item ${r.reward.item}`);
  for (const c of d['clans.json']) for (const e of c.effects) {
    if (e.kind === 'adjacency' && !bIds.has(e.building)) err(`clan ${c.id}: unknown building ${e.building}`);
    if (e.kind === 'unlockTroop' && !tIds.has(e.troop)) err(`clan ${c.id}: unknown troop ${e.troop}`);
  }
  for (const s of d['startTypes.json']) {
    const t = s.season;
    const sum = t.springDays + t.summerDays + t.autumnDays + t.winterDays;
    if (sum !== YEAR_DAYS) err(`startType ${s.id}: season days sum to ${sum}, expected ${YEAR_DAYS}`);
  }
  return errors;
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const errors = validateAll();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('data ok');
}
