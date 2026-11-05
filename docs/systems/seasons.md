# Seasons

20 days per season, 80-day year (D8). Day/night is purely visual (a slow light colour cycle over one day). Season state: `{ index: 0..3, dayOfSeason, year }`. Spring -> Summer -> Autumn -> Winter.

| Season | Food prod | Wood | Stone/Gold | Gather speed | Food upkeep | Human growth | March speed | Look |
|---|---|---|---|---|---|---|---|---|
| Spring | +10% | 0 | 0 | 0 | 0 | x1.0 | 0 | fresh green, rain particles |
| Summer | +20% | 0 | 0 | +5% | 0 | x1.0 | +5% | bright warm, long days |
| Autumn | +0% (harvest event +25% for 3 days) | +10% | 0 | 0 | 0 | x1.1 | 0 | amber leaves |
| Winter | -50% | -20% | -10% | -25% | +30% | x1.5 | -15% | snow tint, blue light |

- Season values live in `balance.json -> seasonMods` and are multiplied together with other sources, with a floor of 25% for any production.
- Winter is the main pressure: the player stockpiles in autumn, builds feed silos, keeps troops fed, defends against bolder raids. Research and the "frozen north" clan reduce or invert some penalties.
- Season change emits `SeasonChanged`; the render layer cross-fades light, leaf tint and snow blend (uniforms only, no regeneration).
- Season length and year length are constants so a player can answer "how long until winter" from the HUD clock.

Tests: modifiers applied in the right systems, floor, determinism over a full year, season change events.
