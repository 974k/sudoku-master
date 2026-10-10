# Sudoku Master

A complete, free Sudoku game for phones, tablets and desktops. It has no ads, accounts or tracking, and it works offline.

- **500 puzzles**: 5 levels (Beginner → Expert) × 10 stages × 10 puzzles, graded by the logic each one needs, not just by clue count.
- **Daily challenge** with a calendar, plus streaks, stars, and 29 achievements (including 5 level badges).
- **Teaching hints** that point to the next logical step, explain it with highlighted cells and candidates, and only then offer to place the digit.
- **Learning mode, an interactive tutorial, and a techniques guide** that shows a real example position for each of the 21 techniques.
- Notes, undo/redo, pause, restart, a timer, an optional mistake limit, auto-save and resume.
- Light, dark and paper themes, three text sizes, high contrast, reduced motion, full keyboard play and screen-reader labels.

## Privacy

The game collects nothing and has no server to send data to.

| Guarantee | How it's enforced |
| --- | --- |
| No network use while playing | Built pages carry a CSP with `connect-src 'none'`, which blocks `fetch`, XHR, WebSocket, EventSource and beacons. |
| No third-party code | Zero runtime dependencies. The shipped JS is only this project's code. No web fonts or CDNs. |
| No tracking | No analytics, telemetry, crash reporting, cookies, fingerprinting or advertising IDs. |
| Local-only data | Progress lives in `localStorage` under `sudoku-master:*` and is never uploaded or synced. |
| No permissions | The game requests no permissions. Vibration needs none, and it can be turned off. |
| User control | Settings → *Delete all data* erases every stored key. |

`npm run build` ends with `scripts/privacy-audit.mjs`, which **fails the build** if the output contains any of the following:

- external URLs
- network APIs (outside the service worker's same-origin cache fallback)
- tracking, fingerprinting or permission APIs
- runtime dependencies
- source maps
- a weak or missing CSP

Testing in a real browser confirmed:

- The only requests are for the game's own files.
- An in-page `fetch()` is refused by the CSP.
- With the server **stopped**, the app still loads and plays from the service worker cache.

One caveat: when the game is hosted on a website, that host sees the normal request for the files when you first open it, and the browser may later re-check those files for updates. Neither request carries game data. To avoid even that, self-host the game or use it only installed and offline.

## Running it

Requires Node 22+.

```bash
npm install
npm run dev        # development server at http://localhost:5173
npm test           # unit tests (engine, puzzle bank, game rules, progression, storage)
npm run build      # typecheck + production build + privacy audit -> dist/
npm run preview    # serve dist/ at http://localhost:4173
```

## Deploying

`dist/` is a static site that any static host can serve. The service worker, which provides offline play, needs HTTPS (or `localhost`).

- **Phones:** open the site and use *Add to Home Screen* or *Install app*. It then runs full screen and offline.
- **App stores:** the PWA can be wrapped with Capacitor (iOS/Android) or a Trusted Web Activity (Android). That wrapping isn't included here. If you publish, the store privacy labels are "Data not collected" / "No data collected".

If your host lets you set headers, these add defence in depth:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()
Referrer-Policy: no-referrer
```

## Windows app (.exe)

`desktop/` wraps the same production build in Electron:

```bash
cd desktop
npm install
node node_modules/electron/install.js   # downloads the Electron runtime
npm run dist                            # web build + privacy audit + both .exe files
npm run smoke                           # self-test: game loads, network sealed, saving works
```

Output in `desktop/release/`:
- `SudokuMaster-1.0.0-portable.exe`: a single file to run anywhere, with no install.
- `SudokuMaster-1.0.0-setup.exe`: an installer with Start menu and desktop shortcuts. It installs per user, needs no admin rights, and removes its data on uninstall.

How the desktop app keeps your data private:
- **No server, no open ports.** It loads the game's files from inside the app through a private `app://` scheme.
- **No network access.** Any request for anything other than those files is cancelled, on top of the page's own CSP.
- **No permissions, popups or outside pages.** Every permission request is denied, and new windows and navigation away from the game are blocked.
- **Nothing phoning home.** Spellcheck is off, and there's no crash reporter, telemetry or background update check.

Progress is saved in `%APPDATA%\Sudoku Master`, separately from any browser copy of the game. The .exe files are unsigned, so Windows SmartScreen may show a warning the first time; choose *More info → Run anyway*.

### Updates

The installed app has **Settings → Check for updates**. One click does the whole update:
1. It checks this repository's [GitHub Releases](https://github.com/974k/sudoku-master/releases).
2. It downloads the new installer and verifies its SHA-512 checksum from `latest.yml`.
3. It installs silently and restarts. Saved progress is kept.

How the updater stays private:
- It only runs on that click; nothing checks in the background.
- Its network session may reach only GitHub's release hosts, and only while that update is running.
- The game page itself stays sealed and asks the main process to do the work.
- No game data is sent.

The portable .exe can't replace itself, so it offers to open the download page instead.

To publish a new version:

```bash
cd desktop
# 1. bump "version" in desktop/package.json, e.g. 1.0.2
npm run release      # builds, then creates the GitHub Release with the installer, latest.yml and .blockmap
```

`npm run release` needs the GitHub CLI signed in (`gh auth login`). Installed copies find the new version the next time a player clicks the button.

## How the puzzles work

All puzzles are produced and checked by this project's own engine (`src/engine/`):

- `solver.ts` is a bitmask backtracking solver. It proves every puzzle has exactly one solution.
- `generator.ts` builds a random solved grid, then removes clues in symmetric pairs while the solution stays unique.
- `logic.ts` is a human-style solver with 22 techniques, from Full House up to XY-Chain. Its deductions are always forced, never guessed. Tests check that every deduction agrees with the true solution.
- `grade.ts` places each puzzle in a level by the hardest technique it needs, and orders puzzles within a level by effort.

`npm run generate:puzzles` regenerates `src/data/puzzles.ts` deterministically from a seed in about 20 seconds. The tests then verify every bundled puzzle:

- it has a unique solution
- it can be solved by logic alone
- it sits in the right level
- it has no duplicates
- difficulty never decreases from stage to stage

Daily puzzles come from a separate pool. A seeded symmetry transform (relabelling digits, permuting rows and columns) makes each day's grid look new while keeping its unique solution and difficulty.

## Project layout

```
src/engine/   solver, logical solver, grader, generator, explanations (pure TS, no DOM)
src/game/     catalog, game state & undo, hints, profile/progression, achievements, storage, tutorial
src/ui/       board view, screens, components, theme, sound (Web Audio, synthesized)
src/data/     generated puzzle bank
scripts/      puzzle generator, icon generator, service-worker template, privacy audit
```
