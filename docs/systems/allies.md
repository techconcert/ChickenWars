# Allies

## Lords
Neutral animal lords live in villages (one per region from tier 1; about 6 per map): name, banner colour, personality (`trader`, `warlike`, `scholar`, `builder`), likes/dislikes (resources), strength, a small army.

The six lords are farm animals: Baron Boarington (a boar, builder), Lady Moo-ra (a cow, trader), Lord Gallop (a horse, warlike), Lady Hoot (an owl, scholar), Lord Ramsey (a ram, warlike) and Lady Mole-ly (a mole, trader). Their soldiers use the same troop defs as ours. Their villages are animal villages on the map.

## Reputation
Number -100..+100 per lord, mapped to stages: **hostile (< -25)**, **wary (-25..24)**, **friendly (25..64)**, **allied (65+)**.
- Gain: gifts (resource value x factor, personality-modified, diminishing per day), completing their requests, clearing camps near their village, joint rallies.
- Loss: ignoring urgent requests (-5), refusing three requests in a row (-10). Decay toward 0 by 1 per 5 days above friendly (keeps interaction alive).
- Hostile lords refuse trade and may let humans pass (more raids near them). They never attack the player directly in v1 (no PvP).

## What each stage gives
| Stage | Benefits |
|---|---|
| wary | can trade at 1:1 once per day |
| friendly | better trade (3:2 -> 5:4), small passive gift each season, reveals their region fog |
| allied | lord joins rallies, lends troops for defence, hero recruit offer, shared vision, unique tech unlock |

## Requests
Every 1 to 3 days a lord may post a request (data-driven): deliver X resource, clear camp Y, escort a caravan, defend the village in N minutes. Reward is reputation + resources/item. Time-limited but no failure penalty beyond missing the reward (except ignoring urgent ones).

## Rallies
At friendly+ the player can start a rally against a camp/lair/boss: the player's march waits at a rally point up to 3 minutes while allied lords with reputation >= allied send their armies (arrive at their own speed). Combined army fights as one side with lords' heroes contributing buffs and skills (up to 2 allied heroes). Loot share: player 60%, lords 40% split by contribution; reputation + bonus if the target dies.

## UI
Diplomacy panel: lord cards (portrait, stage bar, likes), actions (gift, trade, ask for rally, view requests). Notifications for requests and rally invites.

## Tests
Reputation transitions with thresholds, decay, rally combination, loot share sums to 100%, request expiry, deterministic generation.

## Gifts to the player
Besides the seasonal gift, lords send gifts on their own (`balance.allies.gifts`, `periodicGifts` in `allies/perks.ts`): allied lords every 4 days, friendly every 7, neutral ones with reputation 0 or better every 14, staggered per lord by a hash of its id. They send what they like (allied lords add gold), sized `base x (1 + 0.3 x (Town Hall - 1))` with base 160, 90 and 50. A toast names the lord and the gift. Each gift also has a small chance of a piece of gear (`itemChance`: 3% neutral, 10% friendly, 20% allied; rarity follows the Grand Coop: common, uncommon from TH5, rare from TH10, epic from TH17; allied lords may give one tier better), added to the inventory and named in the toast. Hostile lords never send anything.
