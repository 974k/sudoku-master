// Builds the Windows app and publishes it as a GitHub Release that installed
// copies can update to (Settings → Check for updates).
//
//   1. bump "version" in desktop/package.json (e.g. 1.0.1)
//   2. npm run release            (needs the GitHub CLI, signed in: gh auth login)
//
// Uploads the installer plus the two files the updater needs: latest.yml
// (version + SHA-512 checksum) and the .blockmap (for smaller downloads).

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const { owner, repo } = pkg.build.publish[0];
const version = pkg.version;
const tag = `v${version}`;
const gh = process.env.GH ?? 'gh';
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'npm', ...opts });

// refuse to overwrite an existing release
try {
  execFileSync(gh, ['release', 'view', tag, '--repo', `${owner}/${repo}`], { stdio: 'ignore' });
  console.error(`Release ${tag} already exists in ${owner}/${repo}. Bump "version" in desktop/package.json first.`);
  process.exit(1);
} catch {
  /* not found: good */
}

if (!process.argv.includes('--skip-build')) run('npm', ['run', 'dist']);

const setup = `release/SudokuMaster-${version}-setup.exe`;
const files = [setup, `${setup}.blockmap`, 'release/latest.yml'];
for (const f of files) {
  if (!existsSync(f)) {
    console.error(`Missing ${f} — did the build succeed?`);
    process.exit(1);
  }
}
const latest = readFileSync('release/latest.yml', 'utf8');
if (!latest.includes(`version: ${version}`)) {
  console.error(`release/latest.yml is not for ${version}.`);
  process.exit(1);
}
const sha256 = createHash('sha256').update(readFileSync(setup)).digest('hex');

const notes = [
  `Sudoku Master ${version} for Windows.`,
  '',
  `**New install:** download \`SudokuMaster-${version}-setup.exe\` below and run it. It installs for your user only, without administrator rights.`,
  '**Already installed?** Open Settings → Check for updates in the app.',
  '',
  'Windows may warn that the installer is from an unknown publisher, because it is not code-signed. Choose *More info → Run anyway*.',
  '',
  `SHA-256 of the installer: \`${sha256}\``,
  '',
  '`latest.yml` and the `.blockmap` file are used by the in-app updater; you do not need to download them.',
].join('\n');

run(gh, ['release', 'create', tag, ...files, '--repo', `${owner}/${repo}`, '--title', `Sudoku Master ${version}`, '--notes', notes]);
console.log(`\n✓ Published ${tag}: https://github.com/${owner}/${repo}/releases/tag/${tag}`);
