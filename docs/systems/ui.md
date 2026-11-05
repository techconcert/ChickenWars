# UI

Preact components over the canvas; the canvas handles picking via raycast into a `Selection` store. UI reads state via a `useGame()` selector hook with referential-stability helpers; commands via `dispatch`.

## HUD
- Top bar: resource chips (value / cap, +rate tooltip, flashes near cap), clock (day, season icon, days to next season), speed buttons, pause, menu.
- Left: builder queue + training queue + research queue (small portraits with progress).
- Right: active marches list (click to focus camera).
- Bottom: context panel for the selected thing (building, node, camp, lord, march, hero) with action buttons.
- Minimap bottom-right (generated canvas), with fog and region colour, click to jump.
- Toasts top-centre with severity (info, success, warning, danger). Raid warning is a large persistent banner with ETA and path preview.

## Panels (modal or docked)
Build menu, Building details, Army/Training, Heroes, Research, Map (full), Diplomacy, Quests/Chronicle, Battle report, Settings, New game, Save/Load.

## Interaction
- Click select, double click focus, right-drag pan, wheel zoom, Q/E rotate, WASD pan, Space pause, 1/2/3 speeds, Esc close, B build menu, H heroes, R research, M map, T diplomacy.
- Tooltips everywhere for numbers (show the formula parts), no hidden mechanics.
- Keybinds remappable (M10).

## Style
Parchment panels, ink text, rounded, 2px dark outline, drop shadow; coloured resource chips; large click targets (44px min). CSS variables for theme and a UI scale setting. All strings in `src/ui/strings.ts` (English), no inline literals in components.

## Icons
Drawn at runtime by `src/gen/icons.ts` from vector recipes into canvas, cached.

## Accessibility
Colour-blind-safe markers (shape + colour), UI scale, reduced motion toggle, text size.
