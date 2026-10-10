// Builds the Windows installer, signing it for the in-app updater.
// The private signing key stays outside the repository; by default it is read
// from %USERPROFILE%\.tauri\sudoku-master.key (override: TAURI_SIGNING_PRIVATE_KEY).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const env = { ...process.env };
if (!env.TAURI_SIGNING_PRIVATE_KEY) {
  const keyFile = join(homedir(), '.tauri', 'sudoku-master.key');
  if (!existsSync(keyFile)) {
    console.error(`Signing key not found at ${keyFile}. Updates must be signed with the key whose public half is in tauri.conf.json.`);
    process.exit(1);
  }
  env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(keyFile, 'utf8');
}
env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= '';
const cli = fileURLToPath(new URL('./node_modules/@tauri-apps/cli/tauri.js', import.meta.url));
// extra arguments go to `tauri build` (e.g. --config overrides for a test build)
execFileSync(process.execPath, [cli, 'build', ...process.argv.slice(2)], { stdio: 'inherit', env });
