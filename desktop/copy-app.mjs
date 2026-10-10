// Copies the production web build (../dist) into ./app for packaging.
import { cpSync, existsSync, rmSync } from 'node:fs';

const src = new URL('../dist/', import.meta.url);
const dest = new URL('./app/', import.meta.url);
if (!existsSync(new URL('index.html', src))) {
  console.error('No web build found — run `npm run build` in the parent folder first.');
  process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log('Copied ../dist -> ./app');
