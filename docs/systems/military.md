# Military

## Troop classes and triangle
Triangle: **Infantry > Cavalry > Archers > Infantry**. **Siege** is strong against walls, towers and camp palisades and weak against cavalry; archers deal reduced damage to siege.
- Counter multiplier on damage dealt: x1.25 when the attacker's class counters the defender's, x0.8 when countered.
- Siege vs fortification (walls, towers, palisades): x2.0.

## Chicken troops and their human counterparts
| Class (UI name) | Tier 1 | Tier 2 | Tier 3 | Human counterparts (tier 1/2/3) |
|---|---|---|---|---|
| Infantry (Peckers) | Pitchfork Chick | Spur Soldier | Iron Rooster | Angry Farmer / Animal Control Officer / Riot Police |
| Archers (Slingers) | Egg Slinger | Yolk Marksman | Golden Egg Sniper | Shotgun Farmer / Hunter / Army Sniper |
| Cavalry (Pig Riders) | Piglet Rider | Boar Knight | Hog Lancer | ATV Rider / Pickup Truck / Armored Humvee |
| Siege (Contraptions) | Hay Bale Roller | Egg Catapult | - | (humans use tractors in the visuals) |
| Trade | Egg Peddler (Egg Trading Post) | | | |

Ids in code stay `militia`, `footman`, `guardian`, `bowman`, `marksman`, `sharpshooter`, `rider`, `knight`, `lancer`, `ram`, `catapult`, `trader` and `h_*`.

## Tiers
T1 (Pitchfork Chicks): cheap. T2 (veteran): needs academy research + building level 5. T3 (elite): chili peppers cost, building level 10, TH8+. Stat ratio T1:T2:T3 ~ 1 : 1.7 : 3.0 with cost ratio 1 : 2.2 : 5.

## Troop pools
Home pool per troop id: `{ healthy, wounded, training: Job[] }`. Heroes lead marches; march capacity = hero.lead (troops count) + research.

## Training
Queue per military building (max 3 jobs), time per batch = `count * trainTicks / speedMult`, minimum batch 1. Cost paid up front, refunded 100% on cancel before start, else 50%. Batch size cap 200. No gem speedups.

## Wounded
After a battle, of the troops lost on the player's side, 60% become wounded (go to nursing nest), 40% die; modified by nursing nest level (up to 85% wounded) and research. Nursing Nest heals `heal.perTick` troops per tick across the wounded pool (priority: highest tier first). Wounded beyond nursing nest capacity die at day end (warning shown). Enemy losses are always permanent.

## Marching army composition
A march = 1 hero (required) + troops up to lead cap + optional ally lord. Marches have a **supply** value equal to food carried for 2 minutes of upkeep.
