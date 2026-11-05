import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** Icon as SVG emitted at build time (no image files in the repo; see D31). */
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#f3e7c9"/><path d="M256 70 400 200v40H112v-40z" fill="#b5503c"/><path d="M130 240h252v170H130z" fill="#e8d8b0"/><path d="M130 240h252" stroke="#3a2f26" stroke-width="12"/><rect x="226" y="320" width="60" height="90" rx="8" fill="#7a5538"/><circle cx="256" cy="196" r="22" fill="#e3b341"/><path d="M256 70 400 200v40H112v-40zM130 240h252v170H130z" fill="none" stroke="#3a2f26" stroke-width="14" stroke-linejoin="round"/></svg>`;

/** Emits icon.svg, adds manifest/icon links, and fills the service worker's build id and precache list. */
function pwaPlugin(): Plugin {
  return {
    name: 'chickenwars-pwa',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'link', attrs: { rel: 'manifest', href: './manifest.webmanifest' }, injectTo: 'head' },
      { tag: 'link', attrs: { rel: 'icon', type: 'image/svg+xml', href: './icon.svg' }, injectTo: 'head' },
      { tag: 'meta', attrs: { name: 'theme-color', content: '#3c6ea8' }, injectTo: 'head' },
    ],
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'icon.svg', source: ICON_SVG }); },
    writeBundle(opts, bundle) {
      const dir = opts.dir ?? r('./dist');
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'sw.js');
      const list = ['./', ...files.map((f) => `./${f}`), './manifest.webmanifest'].filter((v, i, a) => a.indexOf(v) === i);
      const swPath = join(dir, 'sw.js');
      if (!existsSync(swPath)) return;
      const build = createHash('sha1').update(files.join('|') + files.map((f) => { const a = bundle[f]; return a && 'code' in a ? a.code.length : a && 'source' in a ? a.source.length : 0; }).join(',')).digest('hex').slice(0, 10);
      writeFileSync(swPath, readFileSync(swPath, 'utf8').replace('__BUILD__', build).replace('__PRECACHE__', JSON.stringify(list)));
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [pwaPlugin()],
  resolve: {
    alias: {
      '@sim': r('./src/sim'),
      '@render': r('./src/render'),
      '@ui': r('./src/ui'),
      '@gen': r('./src/gen'),
      '@app': r('./src/app'),
      '@platform': r('./src/platform'),
      '@data': r('./data'),
    },
  },
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
