// Power maths shared by the resolver, loot preview and UI. Integer only.
import { TROOPS, WORLD } from '../data/registry';
import type { Stack } from '../state';

/** Power of one troop: atk + def + hp/10 (combat.md). Returned x10 to stay integer. */
export function troopPower10(troop: string): number {
  const t = TROOPS[troop];
  return t ? (t.atk + t.def) * 10 + t.hp : 0;
}

/** Sum of count*(atk+def+hp/10), floored. */
export function stacksPower(stacks: readonly Stack[]): number {
  let p10 = 0;
  for (const s of stacks) p10 += s.count * troopPower10(s.troop);
  return Math.floor(p10 / 10);
}

export function recordToStacks(rec: Readonly<Record<string, number>>): Stack[] {
  const out: Stack[] = [];
  for (const k of Object.keys(rec).sort()) {
    const c = rec[k] ?? 0;
    if (c > 0) out.push({ troop: k, count: c });
  }
  return out;
}

export function totalCount(stacks: readonly Stack[]): number {
  let n = 0;
  for (const s of stacks) n += s.count;
  return n;
}

/** Camp level 1..25 from tier and growth: (tier-1)*5 + 1 + floor(4*(strength-base)/(cap-base)) (contract section 6). */
export function campLevel(tier: number, strength: number): number {
  const c = WORLD.banditCamps.find((x) => x.tier === tier) ?? WORLD.banditCamps[0];
  if (!c) return 1;
  const span = Math.max(1, c.tierCap - c.baseStrength);
  const growth = Math.max(0, Math.min(4, Math.floor((4 * (strength - c.baseStrength)) / span)));
  return (c.tier - 1) * 5 + 1 + growth;
}
