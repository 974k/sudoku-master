// Launches the Windows app in self-test mode and prints the report:
//   npm run smoke                 (the freshly built app)
//   node smoke.mjs <path-to-exe>  (any build, e.g. the installed app)
// Checks the game loads, the network is sealed, saving works and the update
// bridge is present. SUDOKU_SMOKE_UPDATE picks an extra test (see
// src-tauri/src/smoke.js): check, auto, ui (installs an update!) or window.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exe = process.argv[2] ?? 'src-tauri/target/release/sudoku-master.exe';
if (!existsSync(exe)) {
  console.error(`No app at ${exe} — run \`npm run build\` first.`);
  process.exit(1);
}
const name = `sudoku-smoke-${process.pid}.json`;
const r = spawnSync(exe, [], { env: { ...process.env, SUDOKU_SMOKE_TEST: join(tmpdir(), name) }, stdio: 'inherit', timeout: 120_000 });
if (r.error) throw r.error;

// update modes add the app version to the file name
const reportFile = readdirSync(tmpdir()).filter((f) => f.startsWith(name)).map((f) => join(tmpdir(), f))[0];
if (!reportFile) {
  console.error('The app did not write a report.');
  process.exit(1);
}
const data = JSON.parse(readFileSync(reportFile, 'utf8'));
// after an installed update, the new version writes its own report later
if (!data.installing) rmSync(reportFile, { force: true });
console.log(JSON.stringify(data, null, 2));

const c = data.checks ?? {};
const ok =
  !data.error &&
  c.boardCells === 81 &&
  String(c.pageFetchExternal).startsWith('blocked') &&
  c.imageBeacon === 'blocked' &&
  c.storageWorks === true &&
  c.bridge === 'object' &&
  c.serviceWorkers === 0;
console.log(ok ? '\n✓ Desktop smoke test passed' : '\n✗ Desktop smoke test FAILED');
process.exit(ok ? 0 : 1);
