import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Strict Content Security Policy for the built app. `connect-src 'none'`
 * means the page cannot fetch, XHR, WebSocket, EventSource or beacon to
 * anywhere — not even its own origin. Everything else is same-origin only.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'sudoku-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** Writes dist/sw.js with a content-hashed cache name and the full asset list. */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  let root = process.cwd();
  return {
    name: 'sudoku-service-worker',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const files = walk(outDir)
        .map((p) => relative(outDir, p).split(sep).join('/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map'))
        .sort();
      const template = readFileSync(resolve(root, 'scripts/sw-template.js'), 'utf8');
      const hash = createHash('sha256').update(template);
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const sw = template.replace('__VERSION__', version).replace('__ASSETS__', JSON.stringify(files.map((f) => `./${f}`), null, 2));
      writeFileSync(join(outDir, 'sw.js'), sw);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [contentSecurityPolicy(), serviceWorker()],
  build: {
    target: 'es2022',
    sourcemap: false,
    // the polyfill would add fetch() calls; modern browsers don't need it
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
