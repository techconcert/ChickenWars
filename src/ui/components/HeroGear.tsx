import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { HEROES, ITEMS } from '@sim/data/registry';
import { ITEM_MAX_UPGRADE, itemUpgradeCost, itemUpgradeMult } from '@sim/heroes/constants';
import { itemWearer } from '@sim/systems/heroes';
import type { ItemInstance, Slot } from '@sim/state';
import { act, why } from '../act';
import { useGame } from '../hooks';
import { S } from '../strings';
import { Cost, Icon, Rarity } from './Common';

const SLOTS: Slot[] = ['weapon', 'armour', 'banner', 'trinket'];
const STAT_KEYS = ['atk', 'def', 'hp', 'lead', 'gather'] as const;

/** "+12% Attack, +4% Health" for an item instance (upgrades add 10% of the base each). */
function itemStats(inst: ItemInstance): string {
  const def = ITEMS[inst.def];
  if (!def) return '';
  const m = itemUpgradeMult(inst.upgrade);
  return STAT_KEYS.filter((k) => (def.stats[k] ?? 0) !== 0).map((k) => `+${Math.round((def.stats[k] ?? 0) * m * 10) / 10}% ${S.heroes.stats[k]}`).join(', ');
}

function ItemLine({ inst, hero, slot }: { inst: ItemInstance; hero: string; slot: Slot }): JSX.Element {
  const { client, state } = useGame();
  const def = ITEMS[inst.def];
  const wearer = itemWearer(state, inst.id);
  const equipCmd = { t: 'equip', hero, slot, item: inst.id } as const;
  const upCmd = { t: 'upgradeItem', item: inst.id } as const;
  const maxed = inst.upgrade >= ITEM_MAX_UPGRADE;
  const eqWhy = wearer === hero ? S.heroes.equip : why(state, equipCmd);
  const upWhy = maxed ? S.heroes.maxUp : why(state, upCmd);
  const cost = def && !maxed ? itemUpgradeCost(def.rarity, inst.upgrade + 1) : {};
  return (
    <div class={`itemline rar-${def?.rarity ?? 'common'}`}>
      <div class="grow">
        <b class="itemname">{def?.name ?? inst.def}{inst.upgrade > 0 ? ` +${inst.upgrade}` : ''}</b> <Rarity r={def?.rarity ?? 'common'} />
        <div class="small">{itemStats(inst)}</div>
        <div class="small muted">{wearer ? `${S.heroes.inUse}: ${HEROES[wearer]?.name ?? wearer}` : S.heroes.free}</div>
      </div>
      <div class="itemacts">
        {!maxed && <span class="small"><Cost cost={cost} have={state.resources} /></span>}
        <button class="btn small" disabled={!maxed && upWhy !== ''} title={upWhy} onClick={() => act(client, upCmd, S.heroes.upgraded)}>{S.heroes.upgrade}</button>
        <button class="btn small primary" disabled={wearer === hero || eqWhy !== ''} title={wearer === hero ? '' : eqWhy} onClick={() => act(client, equipCmd)}>{S.heroes.equip}</button>
      </div>
    </div>
  );
}

export function HeroGear({ id }: { id: string }): JSX.Element | null {
  const { client, state } = useGame();
  const [slot, setSlot] = useState<Slot>('weapon');
  const h = state.heroes[id];
  if (!h) return null;
  const items = Object.values(state.inventory).filter((i) => ITEMS[i.def]?.slot === slot)
    .sort((a, b) => (ITEMS[b.def]?.rarity ?? '').localeCompare(ITEMS[a.def]?.rarity ?? '') || Number(a.id) - Number(b.id));
  return (
    <div>
      <div class="slotgrid">
        {SLOTS.map((s) => {
          const ref = h.equipment[s];
          const inst = ref ? state.inventory[ref] : undefined;
          const def = inst ? ITEMS[inst.def] : undefined;
          const unCmd = { t: 'equip', hero: id, slot: s, item: null } as const;
          return (
            <div key={s} class={`gearslot ${slot === s ? 'on' : ''} ${def ? `rar-${def.rarity}` : ''}`}>
              <button class="gearbtn" onClick={() => setSlot(s)} aria-pressed={slot === s}>
                <span class="small muted">{S.heroes.slots[s]}</span>
                <b class="itemname">{def ? `${def.name}${inst && inst.upgrade > 0 ? ` +${inst.upgrade}` : ''}` : S.heroes.empty}</b>
                {inst && <span class="small">{itemStats(inst)}</span>}
              </button>
              {def && <button class="btn small ghost" title={why(state, unCmd) || S.heroes.unequip} disabled={why(state, unCmd) !== ''} onClick={() => act(client, unCmd)}>{S.heroes.unequip}</button>}
            </div>
          );
        })}
      </div>
      <h4><Icon id="research" size={18} /> {S.heroes.inventory}: {S.heroes.slots[slot]}</h4>
      {items.length === 0 ? <p class="muted small">{S.heroes.noItems}</p> : items.map((i) => <ItemLine key={i.id} inst={i} hero={id} slot={slot} />)}
    </div>
  );
}
