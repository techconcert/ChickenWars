// Generates the bounty pool (about 800 quests) from data/bounties.json: template x band x variant.
// Counts and rewards scale with the band (Town Hall range), so the same objective asks for more at higher tiers.
import type { BountiesData, QuestDef, QuestStepData } from '../data/schema';

/** Item families used for bonus rewards; the rarity comes from the band (`<rarity>_<name>` ids in items.json). */
const ITEM_NAMES: Record<string, string[]> = {
  common: ['sword', 'jerkin', 'pennant', 'charm'],
  uncommon: ['blade', 'mail', 'standard', 'compass'],
  rare: ['warblade', 'plate', 'banner', 'signet'],
  epic: ['emberbrand', 'aegis', 'crownstandard', 'heartstone'],
};

const COUNT_FIELD: Record<string, string> = {
  trained: 'count', campCleared: 'count', ruinExplored: 'count', researchDone: 'count', giftGiven: 'count', cellsExplored: 'count',
  bossKilled: 'count', heroRecruited: 'count', gathered: 'amount', counter: 'value',
};

/** Rounds a quantity to a friendly number (multiples of 1, 5, 10, 25 or 50 as it grows). */
export function nice(n: number): number {
  if (n < 10) return Math.max(1, Math.round(n));
  const step = n < 50 ? 5 : n < 200 ? 10 : n < 1000 ? 25 : 50;
  return Math.max(step, Math.round(n / step) * step);
}

/** Band index (1-based) for a Town Hall level: the last band whose range starts at or below it. */
export function bandForTh(data: BountiesData, th: number): number {
  let best = data.bands[0]!.id;
  for (const b of data.bands) if (th >= b.th[0]) best = b.id;
  return best;
}

/** Band number encoded in a bounty id (`bounty_<template>_b<band>_<variant>`); 0 when it is not one. */
export function bandOfId(id: string): number {
  const m = /_b(\d+)_[a-z]+$/.exec(id);
  return m ? Number(m[1]) : 0;
}

export function generateBounties(data: BountiesData): QuestDef[] {
  const out: QuestDef[] = [];
  let k = 0;
  for (const tpl of data.templates) {
    for (const band of data.bands) {
      if (band.id < tpl.bands[0] || band.id > tpl.bands[1]) continue;
      data.variants.forEach((variant, vi) => {
        k++;
        const growth = 1 + (band.count - 1) * (tpl.scale ?? 1);
        const n = Math.max(1, nice(tpl.base * growth * variant.count));
        const field = COUNT_FIELD[String(tpl.step['kind'])] ?? 'count';
        const step = { ...tpl.step, [field]: n } as unknown as QuestStepData;
        if (tpl.label && step.kind === 'counter') (step as { label?: string }).label = tpl.label.replace('{n}', String(n));
        const worth = tpl.value * band.reward * variant.reward;
        const resources: Record<string, number> = {};
        for (const r of Object.keys(tpl.res).sort()) {
          const amt = nice(worth * (tpl.res[r as keyof typeof tpl.res] ?? 0));
          if (amt > 0) resources[r] = r === 'ember' ? Math.max(1, Math.round(amt / 25)) : amt;
        }
        const rewards: QuestDef['rewards'] = { resources };
        if (variant.extras) {
          rewards.xp = nice(15 * band.reward);
          if (band.id >= 2) {
            const names = ITEM_NAMES[band.rarity]!;
            rewards.item = `${band.rarity}_${names[k % names.length]}`;
          }
          if (band.id >= 4) resources['ember'] = (resources['ember'] ?? 0) + band.id - 2;
        }
        out.push({
          id: `bounty_${tpl.id}_b${band.id}_${variant.id}`,
          title: `${tpl.titles[Math.min(vi, tpl.titles.length - 1)]} (${band.name})`,
          text: `${band.opener} ${tpl.text.replace('{n}', String(n))}`,
          steps: [step],
          rewards: rewards as QuestDef['rewards'],
          next: null,
        });
      });
    }
  }
  return out;
}
