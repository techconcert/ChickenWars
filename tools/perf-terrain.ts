/**
 * Measures terrain generation (worker) and render cost in real Chrome.
 *   npx tsx tools/perf-terrain.ts [--base http://localhost:5183] [--radii 40,60]
 * Prints one JSON line per scenario: generation timings from the debug page, then triangles / draw calls / frame ms of the
 * game world scene (fully explored) at city / region / world zoom.
 */
import { chromium } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const args = process.argv.slice(2);
const get = (k: string, d: string): string => { const i = args.indexOf(`--${k}`); return i >= 0 ? (args[i + 1] ?? d) : d; };
const base = get('base', 'http://localhost:5183');
const radii = get('radii', '40,60').split(',').map(Number);

async function main(): Promise<void> {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  for (const r of radii) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.goto(`${base}/?debug=terrain&radius=${r}`);
    await page.waitForFunction(() => (window as unknown as { __terrainDebug?: { stats(): Record<string, number> } }).__terrainDebug?.stats().totalMs, undefined, { timeout: 60000 });
    await page.waitForTimeout(1500);
    const gen = await page.evaluate(() => (window as unknown as { __terrainDebug: { stats(): unknown } }).__terrainDebug.stats());
    console.log(JSON.stringify({ scenario: `debug r${r}`, ...(gen as object) }));
    await page.close();

    const g = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await g.goto(`${base}/?demo=1&scene=world&size=${r === 60 ? 'standard' : 'small'}`);
    await g.waitForFunction(() => (window as unknown as { __game?: unknown }).__game !== undefined, undefined, { timeout: 60000 });
    await g.waitForTimeout(r === 60 ? 8000 : 5000);
    await g.evaluate(() => {
      const gm = (window as unknown as { __game: { state: { world: { fog: number[] } } } }).__game;
      gm.state.world.fog.fill(2);
    });
    for (const [name, key] of [['city', '1'], ['region', '2'], ['world', '3']] as const) {
      // zoom levels are driven by the camera rig; emulate wheel to reach them
      await g.evaluate((k) => {
        const rig = (window as unknown as { __rig?: { setZoomLevel(i: number): void } }).__rig;
        rig?.setZoomLevel(Number(k) - 1 as 0 | 1 | 2);
      }, key);
      await g.waitForTimeout(2500);
      const s = await g.evaluate(() => (window as unknown as { __game: { renderer: { getStats(): unknown } } }).__game.renderer.getStats());
      console.log(JSON.stringify({ scenario: `game r${r} ${name}`, ...(s as object) }));
    }
    await g.close();
  }
  await browser.close();
}
void main();
