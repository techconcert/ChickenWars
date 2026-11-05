# ChickenWars theme guide

The game is a funny chicken-farm 4X. You are a flock of chickens; the enemy is humans (farms, then feedlots, suburbs and cities); the lords are other farm animals who want to help; the heroes are named chickens. See `05-decisions.md` D45.

**Important:** the theme is a presentation layer. All **code, data and save ids are unchanged** from the original fantasy version (`town_hall`, `militia`, `bandit_camp`, `lord_hale`, ...). Display names come from the `name` fields in `data/*.json`, from `src/ui/strings.ts` and from the generated pools (`data/bounties.json`, `data/events.json`). When you add content, give it a funny chicken-farm name and keep the id snake_case.

## Tone
Funny, warm and a bit absurd, never grim. Chickens are brave, bickering and underestimated; humans are bumbling but dangerous (shotguns, tractors, riot police). Puns are welcome (Yolk Marksman, Egg Barrage, Mother Hen) as long as the name still tells you what the thing does.

## World mapping
| Original idea | ChickenWars |
|---|---|
| City / town / Town Hall | Farm / Grand Coop (`town_hall`) |
| Bandit camps, lairs | Human farms (tiers 1 to 3), feedlots (3), suburbs (4), cities (5); lairs are human compounds (`bandit_camp`, `lair`) |
| Region bosses | Farmer McGruff, The Combine Harvester, The Mayor, The Fast-Food Tycoon, The Colonel |
| Lords and villages | Animal lords and animal villages |
| Ruins | Old barns |
| Shrines | Golden egg shrines (blessings) |
| Caches | Feed caches |
| Regions (tier 1 to 6) | Home Meadow, Barnyard Fields, Feedlot Flats, The Suburbs, Industrial Zone, Downtown |
| Start types | Creek Meadow, Frosty Pasture, Pond Islands |
| Clans | Flocks (Silkie, Orpington, Wyandotte, Rhode Island) |

## Resources
| id | name |
|---|---|
| `food` | Feed |
| `wood` | Twigs |
| `stone` | Pebbles |
| `gold` | Golden Eggs |
| `ember` | Chili Peppers |

## Buildings
| id | name |
|---|---|
| `town_hall` | Grand Coop |
| `house` | Chicken Coop |
| `farm` | Corn Field |
| `lumber_camp` | Twig Yard |
| `quarry` | Pebble Pit |
| `mine` | Golden Roost |
| `storehouse` | Feed Silo |
| `trading_post` | Egg Trading Post |
| `market` | Egg Market |
| `barracks` | Rooster Barracks |
| `archery_range` | Egg Toss Range |
| `stable` | Pigsty |
| `siege_workshop` | Contraption Barn |
| `infirmary` | Nursing Nest |
| `academy` | Owl Academy |
| `tavern` | Worm Tavern |
| `watchtower` | Lookout Perch |
| `wall` | Picket Fence |
| `builders_hut` | Builder Hen's Shed |

## Troops
| id | name | class |
|---|---|---|
| `militia` | Pitchfork Chick | infantry |
| `footman` | Spur Soldier | infantry |
| `guardian` | Iron Rooster | infantry |
| `bowman` | Egg Slinger | archer |
| `marksman` | Yolk Marksman | archer |
| `sharpshooter` | Golden Egg Sniper | archer |
| `rider` | Piglet Rider | cavalry |
| `knight` | Boar Knight | cavalry |
| `lancer` | Hog Lancer | cavalry |
| `ram` | Hay Bale Roller | siege |
| `catapult` | Egg Catapult | siege |
| `trader` | Egg Peddler (trader) | infantry |
| `h_farmer` | Angry Farmer (human enemy, not trainable) | infantry |
| `h_animal_control` | Animal Control Officer (human enemy, not trainable) | infantry |
| `h_riot` | Riot Police (human enemy, not trainable) | infantry |
| `h_shotgun` | Shotgun Farmer (human enemy, not trainable) | archer |
| `h_hunter` | Hunter (human enemy, not trainable) | archer |
| `h_sniper` | Army Sniper (human enemy, not trainable) | archer |
| `h_atv` | ATV Rider (human enemy, not trainable) | cavalry |
| `h_pickup` | Pickup Truck (human enemy, not trainable) | cavalry |
| `h_humvee` | Armored Humvee (human enemy, not trainable) | cavalry |

## Heroes (all chickens)
| id | name |
|---|---|
| `aldric` | Colonel Clucksworth |
| `mira` | Henrietta Hawkeye |
| `bran` | Bantam Bran |
| `seren` | Seren the Silkie |
| `kael` | Kael Talons |
| `ysolde` | Ysolde Yolk |
| `edda` | Edda Eggshell |
| `torvald` | Torvald Ironbeak |
| `liora` | Liora Lightfeather |

## Lords (animals)
| id | name |
|---|---|
| `lord_hale` | Baron Boarington (Boar) |
| `lady_orsa` | Lady Moo-ra (Cow) |
| `lord_varn` | Lord Gallop (Horse) |
| `lady_ilse` | Lady Hoot (Owl) |
| `lord_thorn` | Lord Ramsey (Ram) |
| `lady_mey` | Lady Mole-ly (Mole) |

## Clans (flocks)
| id | name |
|---|---|
| `oakwarden` | Silkie Flock |
| `stonekin` | Orpington Flock |
| `riverfolk` | Wyandotte Flock |
| `ironvale` | Rhode Island Flock |

## Items
| id | name |
|---|---|
| `common_sword` | Worn Spur |
| `uncommon_blade` | Keen Spur |
| `rare_warblade` | War Spur |
| `epic_emberbrand` | Chili Spur |
| `common_jerkin` | Feather Vest |
| `uncommon_mail` | Tin Foil Vest |
| `rare_plate` | Colander Plate |
| `epic_aegis` | Frying Pan Aegis |
| `common_pennant` | Feather Pennant |
| `uncommon_standard` | Barnyard Standard |
| `rare_banner` | Banner of the Coop |
| `epic_crownstandard` | Golden Comb Standard |
| `common_charm` | Lucky Eggshell |
| `uncommon_compass` | Brass Weathervane |
| `rare_signet` | Rooster Signet |
| `epic_heartstone` | Golden Egg |

## Hero skills
| id | name |
|---|---|
| `cleave` | Flurry of Pecks |
| `rally_cry` | Mighty Cluck |
| `volley` | Egg Barrage |
| `shield_wall` | Fluff Wall |
| `charge` | Feathered Charge |
| `mend` | Mother Hen |

## Class names in the UI
Infantry = Peckers, archers = Slingers, cavalry = Pig Riders, siege = Contraptions. The counter triangle is unchanged: Peckers beat Pig Riders, Pig Riders beat Slingers, Slingers beat Peckers.

## Where names live
- `data/*.json` `name` fields (buildings, troops, heroes, lords, clans, items, research, skills, resources, start types, world regions and bosses)
- `src/ui/strings.ts` (UI words, error messages, event toasts, POI and node names, class names)
- `data/quests.json`, `data/bounties.json`, `data/events.json` (quest and event text; the last two are templates that generate about 790 and 850 entries)
- `src/render/meshes/chickens.ts`, `markers.ts`, `buildings/house.ts` (models)

## Portraits
Hero avatars are procedural chicken faces (`src/ui/portrait.ts`): rooster or hen, one of 8 breeds (leghorn, rhode island red, barred rock, orpington, australorp, wyandotte, sussex, silkie), comb style, wattles, earlobes, and a class accessory (warrior bandana, ranger feathered headband, strategist monocle and scarf). Lord avatars are farm animals by lord id. Same id, same face. Screenshot: `docs/screenshots/chickenwars-portraits.jpg`.
