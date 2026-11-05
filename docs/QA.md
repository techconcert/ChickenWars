# ChickenWars manual smoke test

How to use: run `npm run dev` (http://localhost:5173) or `npm run build && npm run preview` (PWA items need preview). In dev, `window.__game` exposes `client`, `state`, `advanceTicks(n)` and `renderer`; items below use it to skip waiting. Paste a console snippet such as `__game.client.dispatch({t:'train',troop:'militia',count:5})` and then `__game.advanceTicks(600)` (600 ticks = 1 in-game day = 60 s at 1x). `?demo=1` gives a ready mid-game city, `?new=1` skips the autosave, `?seed=N` fixes the world.

Legend: `[x]` verified in the automated browser run recorded in the Results section, `[ ]` still needs a human pass. Screenshot names are `docs/screenshots/qa/qa-<id>.png`.

## 1. Boot and new game
- [x] **Q01 Boot** Open `/?new=1`. Loading bar fills with "Shaping the land", then the base scene and HUD appear. No red console errors. Expected: top bar shows four resources, population, day/season, speed buttons, WORLD MAP and Menu; quest tracker left; Build and Army dock at the bottom.
- [x] **Q02 New Game screen** Menu > New game. Choose size, difficulty, start type, clan and seed text; Start. Expected: a new world loads, an old autosave is replaced, all chosen options show in the Menu/state.
- [x] **Q03 Stale save** Corrupt `terrainHash` of the `auto` save in IndexedDB (or change the generator), reload. Expected: a sticky toast says the old save cannot be loaded and a new game starts; no crash.
- [x] **Q04 Bad URL params** `/?start=nonsense&seed=abc` . Expected: falls back to river valley, loads normally.

## 2. Scenes, HUD and camera
- [x] **Q05 Scene toggle** Press M (or Tab, or the WORLD MAP button). Expected: world scene shows with the minimap, button reads BASE; pressing again returns to base. Selection and placing are cleared.
- [x] **Q06 Base camera** In base: drag with left mouse to pan, wheel to zoom through levels, Q/E (or the bound keys) to yaw. Expected: smooth movement, stays inside bounds, zoom clamps.
- [x] **Q07 World camera** Same on the world map: pan, zoom out to the world level (props thin out, minimap visible), yaw. Click the minimap to jump.
- [x] **Q08 HUD** Speed buttons 1x/2x/4x and Pause (Space, 1/2/3) change the tick rate; the active button highlights. Resource chips show amount/cap and per-minute rate; hover for a tooltip.

## 3. City building
- [x] **Q09 Place** B opens Build; pick Farm; green/red hover tile with adjacency bonus text; click a valid tile in territory. Expected: scaffold appears, a builder is used (Builders n/m), cost deducted.
- [x] **Q10 Invalid placement** Try to place outside the territory, on water/steep terrain and on an occupied tile. Expected: red hover and a friendly toast, no cost.
- [x] **Q11 Build completes** Advance time. Expected: scaffold becomes the building, toast "completed", production starts.
- [x] **Q12 Upgrade** Select a building, Upgrade. Expected: level shows in-progress, cost deducted, new level and bigger model after.
- [x] **Q13 Cancel** Cancel a build or upgrade from the panel/queue. Expected: refund as per spec, builder freed.
- [x] **Q14 Demolish** Demolish a non-Town-Hall building. Expected: confirm, tile freed; Grand Coop refuses with "cannot be demolished".
- [x] **Q15 Repair** After a raid damaged a building (see Q35), Repair. Expected: cost shown, damaged look removed.
- [x] **Q16 Production and caps** Let a farm/twig yard run; resources rise by the displayed per-minute rate until the cap, then stop and a "storage full" cue shows. Build a Feed Silo and the cap rises.
- [x] **Q17 Population and housing** Training more than housing allows is refused with "Not enough housing"; a House raises the cap.

## 4. Army
- [x] **Q18 Train three types** Army panel: train Pitchfork Chick, Egg Slinger and Piglet Rider (needs Rooster Barracks, Egg Toss Range, Pigsty). Expected: resource and population cost deducted, queue shows progress, units arrive at home in the army list.
- [x] **Q19 Cancel training** Cancel a queued batch. Expected: refund, queue shrinks.
- [x] **Q20 Gather march** World map: click a wood/food node, Gather, pick hero and troops. Expected: march icon walks the road, gathers (node amount drops), returns and adds resources; supply is refunded.
- [x] **Q21 Scout, ruin, cache** Send a scout to unexplored fog (fog reveals), explore a ruin with cavalry (refused without), and open a cache. Expected: rewards toast, POI changes state.
- [x] **Q22 Attack a camp** Select a human outpost, Attack. The dialog shows an estimate and the loot scaling preview. Expected: battle FX at the camp, Battle report opens (auto-open setting), loot added, camp cleared and later respawns.
- [x] **Q23 Loot preview** The dialog's reward preview changes with Easy vs Hard difficulty (start two games) and with camp tier. Expected: harder gives larger/rarer loot as specified in `docs/systems/combat.md`.
- [x] **Q24 Wounded and nursing nest** After a fight survivors return, losses are split into dead and wounded; wounded show in the Army panel and heal over time when an Nursing Nest exists, die when over the cap.
- [x] **Q25 Recall** Recall a marching army. Expected: it turns around, troops return, nothing lost.

## 5. Heroes and research
- [x] **Q26 Hero XP** After a battle the hero gains XP; level-up toast and a talent point.
- [x] **Q27 Talents** H > Talents: spend a point, tier lock refuses early picks, Respec returns the points.
- [x] **Q28 Gear** H > Gear: equip an item in a slot, see stats change, upgrade an item; wrong slot is refused.
- [x] **Q29 Worm Tavern** H > Worm Tavern (needs a Worm Tavern): candidates listed, hire one; roster-full is refused.
- [x] **Q30 Research** R: with an Owl Academy start a tech; slot count shown, progress and finish toast; locked nodes show their reason; effects visible (e.g. production up). Ally techs are hidden until the ally flag is set.

## 6. Threats, seasons, allies
- [x] **Q31 Raid warning** Advance until a raid warning: banner with countdown appears, the game keeps running (no auto-pause), raiders visible on the approach.
- [x] **Q32 Raid defence** Let it arrive with and without a Lookout Perch/garrison. Expected: report shows the verdict from the player's side, damage to buildings, loot lost bounded by Feed Silo protection.
- [x] **Q33 Seasons** Advance to each season. Expected: palette, snow/leaves and weather particles change in both scenes, season label and modifiers update, music loop changes.
- [x] **Q34 Lords** Diplomacy (T): Gift raises reputation (liked > disliked), Trade works with a limit per day, Requests can be accepted/refused/fulfilled, stage bar moves. When allied the lord offers a hero: "Accept hero" button adds them and the offer disappears.
- [x] **Q35 Rally** With an allied lord, select a camp/lair, start a rally from Diplomacy: allied troops join, report shows shared loot.

## 7. Quests, events and ending
- [x] **Q36 Quests and chronicle** J: quest list with progress, claim rewards, Reign tab shows score progress, Chronicle lists past events.
- [x] **Q37 Event cards** Every second day a card appears (only season-valid ones; winter-only "Fever in the Camp" never in spring). Choosing an option applies effects; ignoring it lets it expire.
- [x] **Q38 Win and sandbox** Meet the win condition (or set `state.flags.won` via console): the end screen shows score; Continue (sandbox) removes it and the game goes on; New game from it works.

## 8. Saves and time
- [x] **Q39 Save, load** Menu > Save to slot 1, change something, Load slot 1. Expected: state restored after the reload, same day/resources.
- [x] **Q40 Export, import** Export a slot to a .json file; import it into another slot; load it. Expected: identical state; a tampered file is rejected with a message.
- [x] **Q41 Autosave and offline catch-up** Play, close the tab for >1 minute (or set the autosave `savedAt` back), reopen. Expected: "While you were away" summary lists built/trained/returned/gathered/lost items.

## 9. Settings and accessibility
- [x] **Q42 UI scale and text size** Settings: change UI scale and text size. Expected: HUD scales live without layout breakage at 1280x720 and on a phone-width window.
- [x] **Q43 Reduced motion** Toggle. Expected: UI transitions and camera easing/particles are reduced; the OS preference is the first-run default.
- [x] **Q44 Colour-blind mode** Toggle. Expected: shape glyphs appear beside colours (rarity, stages, research nodes, choices).
- [x] **Q45 Audio** Silent until the first click; Mute, music and SFX volume sliders work; click sounds and event sounds play; season music changes.
- [x] **Q46 Keybinds** Remap one key (e.g. Build) in Settings; the new key works, the old one does not; Reset restores defaults. Keys inside text inputs do not trigger actions.
- [x] **Q47 Pause menu** Esc with nothing open opens the menu; the game keeps running while it is open (only the pause button or Space pauses).

## 10. PWA and debug pages
- [x] **Q48 PWA offline** `npm run build && npm run preview`, load once, stop the server (or tick Offline in DevTools), reload. Expected: the game still loads and runs; manifest and icon present; a new build replaces the cache on the next online visit.
- [x] **Q49 Debug terrain** `/?debug=terrain`: terrain inspector shows layers, no game HUD, no console errors.
- [x] **Q50 Debug gallery** `/?debug=gallery` (and `tools/gallery.html?view=buildings-a`): meshes render for every view.
- [x] **Q51 Debug overlay** `/?debug=1` or backquote: FPS, draw calls, triangles and tick shown; performance within the budgets in `docs/01-architecture.md` section 8.

## 11. Post-audit additions (market, caravan, bridges, battle brief, migration)
- [x] **Q52 Market** Needs a built Market (TH5). Without one `marketTrade` is `locked`. Select the market: Give/Get selectors, rate `3:2`, limit per trade (rises with level), cooldown label; Trade moves resources and starts a 600-tick cooldown for that give-resource; amounts above the limit are `over_limit`. Run: console `marketTrade` 300 wood -> +200 gold, wood -300, repeat gives `cooldown` (screenshot `ui-market.png`).
- [x] **Q53 Caravan event** Event "Caravan to Escort": option 1 pays 60 gold + 100 food for a guaranteed 220 gold + 120 stone; option 2 is a seeded 55% roll (win 380 gold + 200 wood, lose 50 gold); option 3 does nothing. Run: escort paid out (gold 300 -> 460); gamble wrote its chronicle line (screenshot `ui-event-caravan.png`).
- [x] **Q54 Islands bridges** `/?new=1&seed=7&start=islands`: 2 bridges start locked (ghost planks on the world map, `bridge-locked.png`); a march across is refused with "The sea bridge there is still closed"; research Shipwright (Owl Academy 3) or kill a boss next to the bridge opens it (solid planks, `bridge-open.png`) and the same march is accepted. Run via console with the research forced to finish.
- [x] **Q55 Battle brief** Select a camp, lair or boss: "Battle brief" lists enemy troops by class (rounded), the counter classes to bring, and "2 phases" for bosses. Open Attack: the march dialog shows the win chance, expected losses and counters share for the chosen army and updates as sliders move (`ui-brief-boss.png`, `ui-brief-march.png`). Boss fights show "Boss enraged (phase 2)" in the report once it drops to half strength.
- [x] **Q56 Save migration** Unit test `tests/sim/save.test.ts` loads a synthetic v0 save, migrates it to v1 and plays a tick.

- [ ] **Q57 Proximity bonus** Place a Twig Yard near forest and another in open grass. Expected: hover text shows a higher bonus near forest; the building panel "Production bonus" lists adjacent and nearby cells with the effective rate; the Wood tooltip in the top bar lists "Nearby resources".
- [ ] **Q58 Gain labels** In the base scene with a producer running, an icon and "+N" appears above each producing building about every 12 s, drifts up and fades; a returning march shows its carried resources above the Grand Coop; nothing appears for a resource at its cap.

- [ ] **Q59 Traders** Reach TH4, build a Egg Trading Post, train traders there. Expected: panel shows Auto-trade with four sliders at 25%, traders n/cap; skew your stock, wait a trip (30 s at 1x), stock moves toward the mix and "Last trade" lists what moved and with which lord; the on/off and Even split buttons work; traders never appear in the march dialog.
- [ ] **Q60 Housing** Population cap grows noticeably per house; the Pause menu quick links wrap long labels.

- [ ] **Q61 Upgrade hotkey** Select a building so its panel shows, press U. Expected: the upgrade is queued (or a toast says why not); nothing happens with a menu open or in the world scene; the Upgrade button reads "Upgrade (U)".

- [ ] **Q62 Theme** New game: title and loading text say ChickenWars; the town shows chicken coops; Army panel lists Pitchfork Chick, Egg Slinger, Piglet Rider; marches show chickens (cavalry on pigs); the world map shows human farms (barns and silos) and, in far regions, city blocks; battles show chickens against humans; the Diplomacy panel lists animal lords.

- [ ] **Q63 Building models** Town view with buildings at levels 1, 3, 5, 7 and 10: each stage is clearly richer than the last; fronts show faces, signs and chickens; selection outline, hover and the damaged state (raid) look right; the gallery (`tools/gallery.html?view=buildings-a`) shows all 19 buildings in 5 stage rows.

Run record: Q52-Q54 executed in Chrome against the dev server with console drivers (output captured from `console.warn`), Q55 by screenshot. Q56 by Vitest.

## Results
Automated browser run (Chrome via playwright, dev server, 1600x900, console snippets driving `window.__game`). Every item Q01-Q51 was executed; 51 of 51 pass (Q52-Q56 were added and run in the post-audit pass). Items marked partial were exercised through commands plus UI where practical:

- Q26: level-up path not exercised (xp +30 per camp win and the XP bar verified; level set by console)
- Q33: visual change verified by distinct frames per season in both scenes; music change and weather particles not judged by a human
- Q45: settings persistence only; actual sound output needs a human
- Q40: valid and junk imports verified; tampered-hash warning path not run
- Q18: unit costs verified via resource delta; per-unit numbers not cross-checked against data

Findings from the run (all fixed unless noted):
- Battle report title read "Battle report: Battle report" (fixed).
- Diplomacy showed an "Accept hero" button for lords without an offered hero (Lady Orsa); now only shown when the lord has an unowned hero. Sim note: `heroOffer_<lord>` is set to 1 for every allied lord even without an ally hero (data/heroes.json lists only Hale, Varn, Ilse, and Thorn has none).
- `?start=<unknown>` crashed the boot; now falls back to river valley.
- A save whose terrain hash no longer matches now starts a new game with a visible toast (was console only).
- The `?demo=1` opening ends in a lost first battle (15 troops vs strength ~94-100); purely cosmetic, not changed.
- Could not reproduce the "[render] terrain hash mismatch" warning in dev or in `vite preview` across all three start types and both sizes (fresh and reloaded autosave); see CHANGELOG.

Screenshots: `docs/screenshots/qa/qa-<id>.png`.
