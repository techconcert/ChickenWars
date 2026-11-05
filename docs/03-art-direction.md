# Art direction

Reference: `reference/images/northgard-thronefall-ref-1.png` (style and terrain), `reference/images/rock-ring-issue-2.png` (what NOT to produce: rock rings).

## Look
Cartoon, cel-shaded, thick dark outlines, muted but warm palette, chunky readable silhouettes. Closer to Thronefall than Northgard: simple shapes, strong colour blocks, low noise.

## ChickenWars characters
Units follow the `ChickenWars_Test` design language (`docs/09-chickenwars-reference.md`): plump, rounded, big-headed animals with small dark square eyes and only beaks, combs, horns and tools faceted. Chickens: egg-shaped body, round head, three-lobed red comb, yellow beak, wattle, flat wings, three tail feathers, thin yellow legs; a team-coloured scarf marks the flock. Classes: pitchfork chick (colander helmet, pitchfork, pot-lid shield), egg slinger (cap, sling and egg, basket on the back), piglet rider (a chick on a pink piglet with a saddle blanket), hero (taller, golden comb crown, cape, spur sword). Humans: angry farmer (straw hat, pitchfork), shotgun farmer (orange cap), ATV rider, tractor. Enemy bases: red barn, silo and fence ring (farms), grey tower blocks with lit windows (cities). Code: `src/render/meshes/chickens.ts`.

## Rendering recipe
- **Shading:** 3 to 4 hard bands on `N.L`, band edges softened by a hair (about 0.02) to avoid shimmer. Ambient floor so shadows stay coloured, never black. No specular.
- **Outlines:** inverted hull: duplicate mesh, back-face only, vertices pushed along welded smooth normals by a thickness that scales with camera distance (clamped), colour = a darkened version of the surface base colour (not pure black). Thickness: heavy for buildings/units/rocks, light for terrain contours.
- **Colour:** flat vertex colours, no textures except tiny procedural noise for water and grass variation. `THREE.ColorManagement.enabled = false` as in the prototype so painted sRGB values map directly.
- **Light:** one directional sun plus hemisphere ambient. Sun angle and tint are season and time-of-day driven (spring soft green-white, summer warm bright, autumn amber low, winter cold blue-white).
- **Shadows:** a single soft blob shadow under units and buildings is enough at first. Real shadow maps are a later polish option.
- **Fog of war:** unexplored = pale parchment-grey tint with painted-map feel; explored-not-visible = desaturated. Implemented as a low-res fog texture sampled in the cel shader.
- **Water:** flat-colour layered with two scrolling procedural noise bands, shore foam line, circular fade at map edge into the sky colour (fixes the prototype's square sea edge).
- **Weather and season:** snow tint on top levels in winter, leaf-colour shift in autumn, falling particles (leaf/snow) by instanced points.

## Palette
Extend the prototype `PAL` (meadow, boulder, pine, oak, trunk, sand, dirt, snow). Add: roof reds `#b5503c #c9683f`, wall cream `#e8d8b0`, timber `#7a5538`, banner colours per faction (player blue `#3c6ea8`, human red `#a83c3c`, ally green `#4c8a3e`, neutral grey `#8f8d89`), gold `#e3b341`, UI parchment `#f3e7c9`, UI ink `#3a2f26`.

## Readability rules
- Ramps must read from the default zoom: darker side banks, a few lining rocks, stronger dirt tint (prototype known issue 1).
- Interactive things (nodes, camps, lairs, POIs) get a gentle bobbing marker and a team-colour banner. Danger level shown by banner skull count.
- Selection: white outline pulse plus ground ring. Hover: brighten band.
- Never place props that read as a gameplay object (for example a tent in a meadow) unless it is one.

## Camera
- Narrow FOV (about 30 degrees), pitch about 38 degrees, yaw snaps 0/90/180/270 on Q/E or buttons with a quick ease.
- Zoom levels: City (close, buildings readable), Region (units readable), World (icons and region borders only; terrain detail and props fade, borders and fog emphasised).
- Pan: right-drag or edge scroll or WASD; pinch/drag for touch later.

## UI style
Parchment panels with ink-brown text and a dark outline, rounded corners, coloured resource chips, big clear buttons. Sound: soft wood/cloth clicks.
