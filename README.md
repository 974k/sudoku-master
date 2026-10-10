# Sudoku Master

A complete, free Sudoku game for phones, tablets and desktops. It has no ads, accounts or tracking, and it works offline.

- **500 puzzles**: 5 levels (Beginner → Expert) × 10 stages × 10 puzzles, graded by the logic each one needs, not just by clue count. Puzzles unlock one at a time, and completing a stage opens the next (Settings → *Unlock all levels* opens everything).
- **Sudoku AI**: endless new puzzles generated on the device, at a chosen or a random difficulty. Each one is checked for a unique solution and graded by the same logical solver. No AI service or network is involved.
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

`desktop/` wraps the same production build in a native window using [Tauri](https://tauri.app) and Microsoft Edge WebView2, which is built into Windows 10 and 11. The installer is only a few MB.

Building it requires Rust and Microsoft's C++ build tools (Visual Studio Build Tools with the C++ workload):

```bash
cd desktop
npm install
npm run build        # web build + privacy audit + signed installer
npm run smoke        # self-test: game loads, network sealed, saving works
```

`SUDOKU_SMOKE_UPDATE=check|auto|ui|window npm run smoke` adds a test of the update check, the startup check, the update dialog (this one installs an available update), or F11 and transparency (see `src-tauri/src/smoke.js`).

The installer is written to `desktop/src-tauri/target/release/bundle/nsis/`. It installs for the current user without admin rights. When uninstalling, players can choose whether to delete their saved data.

How the Windows app keeps your data private:
- **No network access from the game.** The page's Content Security Policy only allows Tauri's own in-app channel, so the game can't reach the internet. Navigation away from the game is refused.
- **No service worker.** The app's files are already local.
- **Nothing phoning home.** There's no telemetry or crash reporting. The only request the app makes is the update check below, which carries no game data and can be turned off.
- **WebView2 caveat.** WebView2 is a Windows component, so Windows itself may send Microsoft diagnostic data about it according to the player's Windows settings. The app can't change that, and the Privacy page says so.

Progress is saved in the app's own WebView2 storage (`%LOCALAPPDATA%\app.sudokumaster.desktop`), separately from any browser copy of the game. The installer is unsigned, so Windows SmartScreen may show a warning the first time; choose *More info → Run anyway*.

### Updates

A few seconds after it starts, the app reads `latest.json` from this repository's [latest release](https://github.com/974k/sudoku-master/releases/latest) and compares version numbers. If a newer version exists, a small banner and a dot on the Home update button say so. Nothing else happens on its own:
- The banner never appears during a game or lesson; it waits until the player leaves it.
- Offline, or if GitHub doesn't answer, the check fails silently and the game works as usual.
- Players can turn the check off (Settings → *Check for updates at startup*).

The update dialog (the Home update button, or **Settings → Check for updates**) checks right away and shows the installed and available versions. Then:
1. **Download** fetches the new installer with a progress bar and **verifies its signature** against the public key built into the app. Unsigned or tampered installers are rejected.
2. **Install and restart** asks for confirmation, closes the app, installs, and reopens it. Progress and settings are kept.

Every failure has a clear message, the current version keeps working, and a *Release page* button opens the GitHub release for a manual download.

Updates are signed with a private key stored outside the repository, at `%USERPROFILE%\.tauri\sudoku-master.key`. **Back this file up.** Without it, installed copies can't accept future updates, and players would have to reinstall manually.

To publish a new version:

```bash
cd desktop
# 1. bump "version" in desktop/package.json, e.g. 1.1.1
npm run release      # builds, signs, and creates the GitHub Release (installer, latest.json, latest.yml)
```

`npm run release` needs the GitHub CLI signed in (`gh auth login`).

### Full screen and transparency

- **F11** switches full screen on and off; the previous window size, position and maximized state come back (a window snapped to half the screen returns there too). The title-bar maximize button stays separate: it toggles between maximized and the previous window size. In full screen, the game and menus are re-centred to use the extra space, and moving the pointer to the top edge shows an *Exit full screen* button.
- **Settings → Window transparency** makes the whole native window see-through (opacity 40–100%, using the Windows layered-window API). It's always off when the app starts. *Restore full opacity* switches it back. It stays in effect through full screen, minimize and restore.

### Moving from 1.0.x (Electron)

Versions 1.0.0 and 1.0.1 were built with Electron. Their update button installs the new version through `latest.yml` in each release. The new installer removes the old app but keeps its data, and on first launch the app imports the player's progress (once only).

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
