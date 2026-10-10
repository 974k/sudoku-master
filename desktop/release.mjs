// Builds the Windows app and publishes it as a GitHub Release that installed
// copies can update to (Settings → Check for updates).
//
//   1. bump "version" in desktop/package.json (e.g. 1.1.1)
//   2. npm run release            (needs the GitHub CLI, signed in: gh auth login)
//
// Uploads:
//   SudokuMaster-<v>-setup.exe  the installer
//   latest.json                 read by the app's updater; carries the installer's
//                               signature, checked against the key built into the app
//   latest.yml                  lets copies of the earlier Electron app (1.0.x) move
//                               to this version through their own update button

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

const OWNER = '974k';
const REPO = 'sudoku-master';
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const version = pkg.version;
const tag = `v${version}`;
const gh = process.env.GH ?? 'gh';

try {
  execFileSync(gh, ['release', 'view', tag, '--repo', `${OWNER}/${REPO}`], { stdio: 'ignore' });
  console.error(`Release ${tag} already exists. Bump "version" in desktop/package.json first.`);
  process.exit(1);
} catch {
  /* not found: good */
}

if (!process.argv.includes('--skip-build')) {
  // run "npm run build" without a shell when started through npm (npm_execpath is set)
  if (process.env.npm_execpath) execFileSync(process.execPath, [process.env.npm_execpath, 'run', 'build'], { stdio: 'inherit' });
  else execFileSync('npm run build', { stdio: 'inherit', shell: true });
}

const built = `src-tauri/target/release/bundle/nsis/Sudoku Master_${version}_x64-setup.exe`;
for (const f of [built, `${built}.sig`]) {
  if (!existsSync(f)) {
    console.error(`Missing ${f} — did the build succeed (and sign the installer)?`);
    process.exit(1);
  }
}
mkdirSync('release', { recursive: true });
const name = `SudokuMaster-${version}-setup.exe`;
const setup = `release/${name}`;
copyFileSync(built, setup);
const bytes = readFileSync(setup);
const url = `https://github.com/${OWNER}/${REPO}/releases/download/${tag}/${name}`;
const now = new Date().toISOString();

const notes = `Sudoku Master ${version} for Windows.`;
const platform = { signature: readFileSync(`${built}.sig`, 'utf8').trim(), url };
writeFileSync(
  'release/latest.json',
  JSON.stringify({ version, notes, pub_date: now, platforms: { 'windows-x86_64-nsis': platform, 'windows-x86_64': platform } }, null, 2),
);

const sha512 = createHash('sha512').update(bytes).digest('base64');
writeFileSync(
  'release/latest.yml',
  [`version: ${version}`, 'files:', `  - url: ${name}`, `    sha512: ${sha512}`, `    size: ${statSync(setup).size}`, `path: ${name}`, `sha512: ${sha512}`, `releaseDate: '${now}'`, ''].join('\n'),
);

const sha256 = createHash('sha256').update(bytes).digest('hex');
const body = [
  `Sudoku Master ${version} for Windows.`,
  '',
  `**New install:** download \`${name}\` below and run it. It installs for your user only, without administrator rights.`,
  '**Already installed?** Open Settings → Check for updates in the app.',
  '',
  'Windows may warn that the installer is from an unknown publisher, because it is not code-signed. Choose *More info → Run anyway*.',
  '',
  `SHA-256 of the installer: \`${sha256}\``,
  '',
  '`latest.json` and `latest.yml` are used by the in-app updater; you do not need to download them.',
].join('\n');

execFileSync(
  gh,
  ['release', 'create', tag, setup, 'release/latest.json', 'release/latest.yml', '--repo', `${OWNER}/${REPO}`, '--title', `Sudoku Master ${version}`, '--notes', body],
  { stdio: 'inherit' },
);
console.log(`\n✓ Published ${tag}: https://github.com/${OWNER}/${REPO}/releases/tag/${tag}`);
