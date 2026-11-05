# Open questions for the user

Each has a default already applied (see `05-decisions.md`). Answer only if you want something different. Recommended answers in bold.

1. **Engine/language.** Default: TypeScript + three.js in the browser (D1). Alternatives: Godot 4, Unity. **Keep the default.** Switching later costs a rewrite of render and sim code.
2. **Distribution.** Browser only, or also a packaged desktop app (Tauri) and/or mobile? **Browser first, desktop package later.**
3. **City model.** Free placement on hex cells in a growing territory (default, D9) versus Rise-of-Kingdoms-style fixed building slots in a separate city view. **Free placement, one continuous world.**
4. **Win/lose.** Is there a final goal ("Reign": defeat the last boss and reach City level 25) with a soft-fail raid system, or an open sandbox with no ending? **Goal + sandbox afterwards.**
5. **Target session length and total playthrough length.** Default: a full run is about 8 to 12 hours of play; 30 to 60 min sessions. Adjust if you want shorter or longer.
6. **Difficulty options.** Default: Easy / Normal / Hard scaling human strength and gather rates. Want an "ironman" (single save) mode?
7. **Title and tone.** Resolved: the game is "ChickenWars", a funny chicken-farm 4X (D45, `docs/08-theme.md`). Still open: how much humour in event and quest text, and whether humans should ever be playable.
8. **Art for buildings and units.** Default: fully procedural chunky low-poly. Are you open to commissioning or generating hand-made models later (HANDOFF allows buildings/units)?
9. **Audio.** Procedural WebAudio synth effects and a short music loop (default), or none for now?
10. **Input.** Mouse + keyboard only for v1, or touch from the start?
11. **Clans/start types.** Default v1 ships 3 start types (river, frozen north, islands) and 4 clan bonuses; fewer for the first release?
12. **Source control and licence.** Is there a git remote/repo to attach? Any licence preference?
13. **Hero roster.** Default: 6 named heroes at launch recruited via tavern/quests. More, fewer, or a randomly generated roster?
14. **Language.** English only for v1 with externalised strings (default)?
