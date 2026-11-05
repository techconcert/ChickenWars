# Start types and clans (replayability)

## Start types (terrain + rules parameters, see `04-terrain.md` T8)
- **River Valley (default):** meadow + a river channel with fords; balanced food/wood; friendly start.
- **Frozen North:** snow baseline, summer is short (10 days), winter long (30 days), more stone and chili peppers, hardier humans; food is scarce.
- **Islands:** several islands separated by water; regions connect via bridges unlocked by bosses or the Shipwright research; fewer early nodes, richer later.

## Clans (pick one at start; small identity bonuses, no raw power)
- **Oakwarden:** +15% wood, forest cells give +10% adjacency, infantry +5% def.
- **Stonekin:** +15% stone/gold, walls and towers +20% HP, siege cost -10%.
- **Riverfolk:** +15% food, march speed +10%, trade ratio improved one step.
- **Ironvale:** troop training -10% time, heroes +1 starting level, upkeep +5%.
Each clan also changes banner colour and a roof colour accent.

## Map options
Seed (text or number), size (Small radius 40 / Standard 60), difficulty (Easy/Normal/Hard), start type, clan. A "Daily seed" is just a date-derived seed (offline, no server).

## Tests
Each start type generates a connected logic layer; clan modifiers applied once; start state matches definition.
