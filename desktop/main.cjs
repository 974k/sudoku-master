// Sudoku Master for Windows — Electron main process.
//
// Shows the exact same game as the web build (copied into ./app) in a desktop
// window, with privacy enforced at the app level:
//   * files are served from inside the app via a private app:// scheme —
//     no local web server, no open ports;
//   * every request to anything other than the game's own files is cancelled,
//     so nothing can leave the device;
//   * all permission requests are denied; popups and navigation away from the
//     game are blocked; spellcheck (which could download dictionaries) is off;
//   * no crash reporter, no telemetry, no background update checks.
// Updates happen only when the player clicks "Check for updates": the updater
// then talks to GitHub Releases (and nothing else) until that update finishes.
// Game data (localStorage) lives in this Windows user's app-data folder.

'use strict';

const { app, BrowserWindow, Menu, ipcMain, nativeTheme, protocol, session, shell } = require('electron');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const SCHEME = 'app';
const ORIGIN = `${SCHEME}://sudoku`;
const ROOT = path.join(__dirname, 'app');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

// Where releases are published (this project's GitHub Releases).
const RELEASES_PAGE = 'https://github.com/974k/sudoku-master/releases/latest';
// The only hosts the updater may reach: GitHub and its release-download CDN.
const UPDATE_HOSTS = new Set([
  'github.com',
  'api.github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'github-releases.githubusercontent.com',
]);
// electron-updater makes its requests through this dedicated session.
const UPDATER_PARTITION = 'electron-updater';
const portable = Boolean(process.env.PORTABLE_EXECUTABLE_DIR);
/** True only while an update the player asked for is running. */
let updateActive = false;

const smoke = process.env.SUDOKU_SMOKE_TEST ? { blocked: [], served: [], updaterRequests: [] } : null;

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

// Two copies writing the same save data at once could clash: keep one window.
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

/** Serve a file from ./app, refusing anything outside it. */
async function serve(request) {
  const url = new URL(request.url);
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (url.host !== 'sudoku' || !file.startsWith(ROOT + path.sep)) return new Response('Not found', { status: 404 });
  try {
    const body = await readFile(file);
    smoke?.served.push(rel);
    return new Response(body, { headers: { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' } });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

function lockDown() {
  const ses = session.defaultSession;
  // Only the game's own files may load. Everything else is cancelled.
  ses.webRequest.onBeforeRequest((details, callback) => {
    const ok = details.url.startsWith(`${ORIGIN}/`) || details.url.startsWith('devtools://') || details.url.startsWith('data:');
    if (!ok) smoke?.blocked.push(details.url);
    callback({ cancel: !ok });
  });
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  ses.setSpellCheckerEnabled(false);
  // (The game's offline service worker isn't needed here — the desktop app is
  // offline by design — so the app:// scheme doesn't enable service workers.)

  // The updater's own session may only reach GitHub, and only during an
  // update the player started.
  session.fromPartition(UPDATER_PARTITION, { cache: false }).webRequest.onBeforeRequest((details, callback) => {
    let ok = false;
    try {
      const u = new URL(details.url);
      ok = updateActive && u.protocol === 'https:' && UPDATE_HOSTS.has(u.hostname);
    } catch {
      ok = false;
    }
    smoke?.updaterRequests.push({ host: hostOf(details.url), allowed: ok });
    callback({ cancel: !ok });
  });
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 40);
  }
}

// ---------------------------------------------------------------------------
// updates (only on request)

let updater = null;

/** Load electron-updater lazily, so nothing update-related runs until a click. */
function getUpdater() {
  if (updater) return updater;
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = null;
  autoUpdater.on('download-progress', (p) => win?.webContents.send('update:progress', Math.floor(p.percent)));
  updater = autoUpdater;
  return updater;
}

/** Only the game itself (our app:// origin) may drive updates. */
function fromGame(event) {
  return Boolean(event.senderFrame?.url.startsWith(`${ORIGIN}/`));
}

async function whileUpdating(task) {
  updateActive = true;
  try {
    return await task();
  } finally {
    updateActive = false;
  }
}

ipcMain.handle('desktop:info', (event) => (fromGame(event) ? { version: app.getVersion(), portable, packaged: app.isPackaged } : null));

ipcMain.handle('update:check', async (event) => {
  if (!fromGame(event)) throw new Error('Not allowed');
  const current = app.getVersion();
  if (!app.isPackaged) return { status: 'unsupported', current };
  const result = await whileUpdating(() => getUpdater().checkForUpdates());
  const version = result?.updateInfo?.version;
  if (!result?.isUpdateAvailable || !version) return { status: 'latest', current };
  return { status: 'available', current, version, portable };
});

ipcMain.handle('update:download', async (event) => {
  if (!fromGame(event) || !app.isPackaged || portable) throw new Error('Not allowed');
  await whileUpdating(() => getUpdater().downloadUpdate());
  return { status: 'ready' };
});

ipcMain.handle('update:install', (event) => {
  if (!fromGame(event) || !updater) return;
  // Silent install, then start the new version.
  setImmediate(() => updater.quitAndInstall(true, true));
});

ipcMain.handle('update:open-page', (event) => {
  if (fromGame(event)) void shell.openExternal(RELEASES_PAGE);
});

app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${ORIGIN}/`)) event.preventDefault();
  });
});

function createWindow() {
  const dark = nativeTheme.shouldUseDarkColors;
  win = new BrowserWindow({
    title: 'Sudoku Master',
    width: 1120,
    height: 820,
    minWidth: 360,
    minHeight: 560,
    backgroundColor: dark ? '#0f1420' : '#f6f4ef',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  win.once('ready-to-show', () => {
    if (!smoke) win.show(); // the self-test runs without showing a window
  });
  win.on('closed', () => (win = null));
  win.loadURL(`${ORIGIN}/index.html#/`);
  if (smoke) runSmokeTest(win);
}

/**
 * Opt-in self-test (SUDOKU_SMOKE_TEST=<report.json>): checks the game loads and
 * the network is sealed. With SUDOKU_SMOKE_UPDATE it also exercises updates:
 *   check    — ask GitHub for a newer version
 *   download — check, then download and verify it (no install)
 *   ui       — press Settings → Check for updates, like a player (installs!)
 */
function runSmokeTest(w) {
  const { writeFileSync } = require('node:fs');
  const mode = process.env.SUDOKU_SMOKE_UPDATE;
  const out = mode ? `${process.env.SUDOKU_SMOKE_TEST}.${app.getVersion()}.json` : process.env.SUDOKU_SMOKE_TEST;
  w.webContents.once('did-finish-load', async () => {
    const report = { ...smoke, version: app.getVersion(), checks: {} };
    let installing = false;
    try {
      const js = (code) => w.webContents.executeJavaScript(code, true);
      await new Promise((r) => setTimeout(r, 1500));
      const shot = async (name) => writeFileSync(`${process.env.SUDOKU_SMOKE_TEST}.${name}.png`, (await w.webContents.capturePage()).toPNG());
      await shot('home');
      report.checks.title = await js('document.title');
      report.checks.homeButtons = await js(`[...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean).slice(0, 8)`);
      await js(`location.hash = '#/play/beginner-1-1'`);
      await new Promise((r) => setTimeout(r, 800));
      report.checks.boardCells = await js(`document.querySelectorAll('[role=gridcell]').length`);
      report.checks.playTitle = await js(`document.querySelector('h1')?.textContent`);
      await shot('play');
      report.checks.pageFetchExternal = await js(`fetch('https://example.com/collect').then(() => 'SENT', e => 'blocked: ' + e.message)`);
      report.checks.imageBeacon = await js(`new Promise(r => { const i = new Image(); i.onload = () => r('SENT'); i.onerror = () => r('blocked'); i.src = 'https://example.com/pixel.gif'; })`);
      report.checks.storageWorks = await js(`(localStorage.setItem('sudoku-master:smoke', '1'), localStorage.getItem('sudoku-master:smoke') === '1' && (localStorage.removeItem('sudoku-master:smoke'), true))`);
      report.checks.userData = app.getPath('userData');
      report.checks.bridge = await js('typeof window.sudokuDesktop');
      report.checks.desktopInfo = await js('window.sudokuDesktop.info()');
      report.checks.updaterRequestsBeforeClick = smoke.updaterRequests.length;
      if (mode === 'check' || mode === 'download') {
        report.checks.update = await js('window.sudokuDesktop.checkForUpdate()');
        if (mode === 'download' && report.checks.update.status === 'available') {
          report.checks.download = await js('window.sudokuDesktop.downloadUpdate()');
        }
      } else if (mode === 'ui') {
        await js(`location.hash = '#/settings'`);
        await new Promise((r) => setTimeout(r, 600));
        await js(`window.scrollTo(0, document.body.scrollHeight)`);
        await shot('settings');
        await js(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Check for updates').click()`);
        const statusJs = `[...document.querySelectorAll('.set-row')].find(r => r.textContent.includes('App updates'))?.querySelector('small')?.textContent`;
        const seen = [];
        for (let t = 0; t < 600; t++) {
          const st = await js(statusJs);
          if (st && seen[seen.length - 1] !== st && !/d+%$/.test(st)) seen.push(st);
          if (/%$/.test(st ?? '') && !seen.some((x) => x.endsWith('%'))) seen.push(st);
          if (/Installing version|latest version|Couldn't reach|installed app|portable/.test(st ?? '')) break;
          await new Promise((r) => setTimeout(r, 250));
        }
        report.checks.uiStatuses = seen;
        installing = /Installing version/.test(seen[seen.length - 1] ?? '');
      }
    } catch (e) {
      report.error = String(e);
    }
    report.blocked = smoke.blocked;
    writeFileSync(out, JSON.stringify(report, null, 2));
    if (!installing) app.quit(); // otherwise the update itself quits and relaunches
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle(SCHEME, serve);
  lockDown();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
