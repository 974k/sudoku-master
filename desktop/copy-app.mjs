// Copies the production web build (../dist) into ./app for the Windows app,
// with two desktop-specific adjustments:
//   * the page's CSP lets the game talk to the app itself (Tauri IPC); the
//     internet stays blocked exactly as in the web build;
//   * the offline service worker is left out: the app's files are already
//     local, and a cached copy could outlive an app update.
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const src = new URL('../dist/', import.meta.url);
const dest = new URL('./app/', import.meta.url);
if (!existsSync(new URL('index.html', src))) {
  console.error('No web build found — run `npm run build` in the parent folder first.');
  process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
rmSync(new URL('sw.js', dest), { force: true });

const indexUrl = new URL('index.html', dest);
let html = readFileSync(indexUrl, 'utf8');
const swaps = [
  ["connect-src 'none'", 'connect-src ipc: http://ipc.localhost'],
  ["worker-src 'self'", "worker-src 'none'"],
];
for (const [from, to] of swaps) {
  if (!html.includes(from)) {
    console.error(`Expected "${from}" in the web build's CSP — has the CSP changed?`);
    process.exit(1);
  }
  html = html.replace(from, to);
}
writeFileSync(indexUrl, html);
console.log('Copied ../dist -> ./app (desktop CSP, no service worker)');
