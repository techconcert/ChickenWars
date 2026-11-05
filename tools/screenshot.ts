/**
 * Screenshot tool: drives the system Google Chrome through playwright-core (no browser download).
 *   npx tsx tools/screenshot.ts --url http://localhost:5173/?scene=world --out docs/screenshots/world.png
 *        [--wait 4000] [--size 1600x900] [--eval "js"] [--actions file.json] [--selector css]
 * Actions file: JSON array of { "do": "click"|"press"|"type"|"wait"|"eval"|"move"|"wheel"|"drag"|"shot", ... }.
 */
import { chromium, type Page } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FLAG_SETS: string[][] = [
  ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
];

interface Action {
  do: string;
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  key?: string;
  text?: string;
  ms?: number;
  js?: string;
  selector?: string;
  dy?: number;
  out?: string;
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[a.slice(2)] = 'true';
      else {
        out[a.slice(2)] = next;
        i++;
      }
    }
  }
  return out;
}

async function runAction(page: Page, a: Action, defaultOut: string): Promise<void> {
  switch (a.do) {
    case 'click':
      if (a.selector) await page.click(a.selector);
      else await page.mouse.click(a.x ?? 0, a.y ?? 0);
      break;
    case 'move':
      await page.mouse.move(a.x ?? 0, a.y ?? 0);
      break;
    case 'wheel':
      await page.mouse.move(a.x ?? 800, a.y ?? 450);
      await page.mouse.wheel(0, a.dy ?? 0);
      break;
    case 'drag':
      await page.mouse.move(a.x ?? 0, a.y ?? 0);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(a.x2 ?? 0, a.y2 ?? 0, { steps: 8 });
      await page.mouse.up({ button: 'right' });
      break;
    case 'press':
      await page.keyboard.press(a.key ?? '');
      break;
    case 'type':
      await page.keyboard.type(a.text ?? '');
      break;
    case 'wait':
      await page.waitForTimeout(a.ms ?? 500);
      break;
    case 'eval':
      await page.evaluate(a.js ?? '');
      break;
    case 'shot':
      await page.screenshot({ path: resolve(a.out ?? defaultOut) });
      break;
    default:
      throw new Error(`unknown action ${a.do}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const url = args['url'];
  const out = args['out'] ?? 'docs/screenshots/shot.png';
  if (!url) {
    console.error('usage: tsx tools/screenshot.ts --url <url> --out <png> [--wait ms] [--size WxH] [--eval js] [--actions file.json]');
    process.exit(2);
  }
  const [w, h] = (args['size'] ?? '1600x900').split('x').map((n) => parseInt(n, 10)) as [number, number];
  const wait = parseInt(args['wait'] ?? '3000', 10);
  mkdirSync(dirname(resolve(out)), { recursive: true });

  let lastErr: unknown = null;
  for (const flags of FLAG_SETS) {
    let browser;
    try {
      browser = await chromium.launch({ executablePath: CHROME, headless: true, args: flags });
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
      });
      page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
      await page.goto(url, { waitUntil: 'load' });
      const webgl = await page.evaluate(() => {
        const c = document.createElement('canvas');
        return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
      });
      if (!webgl && flags !== FLAG_SETS[FLAG_SETS.length - 1]) {
        await browser.close();
        continue;
      }
      await page.waitForTimeout(wait);
      if (args['eval']) {
        await page.evaluate(args['eval']);
        await page.waitForTimeout(Math.min(wait, 1500));
      }
      if (args['actions']) {
        const actions = JSON.parse(readFileSync(args['actions'], 'utf8')) as Action[];
        for (const a of actions) await runAction(page, a, out);
      }
      if (args['selector']) await page.locator(args['selector']).first().screenshot({ path: resolve(out) });
      else await page.screenshot({ path: resolve(out) });
      console.log(`saved ${out} (${w}x${h}, flags: ${flags.join(' ')}, webgl: ${webgl})`);
      if (errors.length) {
        console.log(`page console problems (${errors.length}):`);
        for (const e of errors.slice(0, 30)) console.log('  ' + e);
      } else console.log('no console errors');
      await browser.close();
      return;
    } catch (e) {
      lastErr = e;
      if (browser) await browser.close().catch(() => undefined);
    }
  }
  console.error('screenshot failed:', lastErr);
  process.exit(1);
}

void main();
