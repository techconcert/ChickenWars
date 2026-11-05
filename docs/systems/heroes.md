# Heroes

## Role
A hero leads each march (required) and fights with a skill. The player owns up to 6 heroes in v1; one is given at the start.

Heroes are named chickens (Colonel Clucksworth, Henrietta Hawkeye, Bantam Bran, Seren the Silkie, Kael Talons, Ysolde Yolk, Edda Eggshell, Torvald Ironbeak, Liora Lightfeather). Skills: Flurry of Pecks (`cleave`), Mighty Cluck (`rally_cry`), Egg Barrage (`volley`), Fluff Wall (`shield_wall`), Feathered Charge (`charge`), Mother Hen (`mend`).

## Stats
`atk, def, hp, lead (max troops), gather (gather speed bonus), speed`. Growth per level from `data/heroes.json`. Level cap 40 (v1), XP curve in `balance.json` (`xp(level) = round(100 * 1.18^(level-1))`).

## Skills
One active skill per hero, fired when rage hits 100 (see combat). Examples: `cleave` (damage to the biggest enemy stack), `rally_cry` (+atk for 3 rounds), `volley` (hits all enemy archers), `shield_wall` (-30% damage taken for 3 rounds), `charge` (cavalry bonus), `mend` (turn 40% of casualties into wounded instead of dead). Skills have 3 ranks unlocked by talent points.

## Talents
Three trees per hero class (Warrior, Ranger, Strategist/Builder). 1 talent point per level, 4 tiers, requirements by points spent. Effects use the same `Effect` vocabulary as research. Respec costs gold, no cooldown, no premium.

## Equipment
Slots: weapon, armour, banner, trinket. Rarity common/uncommon/rare/epic. Drops from camps, lairs, bosses and quests. Upgrading gear uses chili peppers and gold and is done in the Owl Academy panel in v1 (a dedicated forge building is in BACKLOG). Gear is strictly bonus stats and cannot be bought with real money (none exists).

## Recruiting
Worm Tavern (TH2+) offers a rotating set of 3 candidates, refreshed every 2 days, bought with gold. Quest and POI (ruin/shrine) heroes are unique named heroes with short stories (data-driven text).

## UI
Hero panel: portrait (procedural face: shape, hair, colours seeded by hero id), stats, level, talent tree, equipment slots, skill preview. March screen shows leader.

## Tests
XP curve, level ups apply stats, talent prerequisites, skill rank effects, equipment stat sums.
