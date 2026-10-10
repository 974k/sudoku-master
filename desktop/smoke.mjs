// Launches the desktop app in self-test mode and prints the report:
//   npm run smoke                 (unpacked app via Electron)
//   node smoke.mjs <path-to-exe>  (a packaged build)
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import electronPath from 'electron';

const report = join(tmpdir(), `sudoku-smoke-${process.pid}.json`);
const exe = process.argv[2];
const cmd = exe ?? electronPath;
const args = exe ? [] : ['.'];
const r = spawnSync(cmd, args, { env: { ...process.env, SUDOKU_SMOKE_TEST: report }, stdio: 'inherit', timeout: 120_000 });
if (r.error) throw r.error;
const data = JSON.parse(readFileSync(report, 'utf8'));
for (const f of [report, `${report}.home.png`, `${report}.play.png`]) rmSync(f, { force: true });
console.log(JSON.stringify(data, null, 2));
const ok =
  data.checks?.boardCells === 81 &&
  String(data.checks?.pageFetchExternal).startsWith('blocked') &&
  data.checks?.imageBeacon === 'blocked' &&
  data.checks?.storageWorks === true &&
  data.checks?.bridge === 'object' &&
  data.checks?.updaterRequestsBeforeClick === 0;
console.log(ok ? '\n✓ Desktop smoke test passed' : '\n✗ Desktop smoke test FAILED');
process.exit(ok ? 0 : 1);
