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
//   * no auto-updater, no crash reporter, no telemetry.
// Game data (localStorage) lives in this Windows user's app-data folder.

'use strict';

const { app, BrowserWindow, Menu, nativeTheme, protocol, session } = require('electron');
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

const smoke = process.env.SUDOKU_SMOKE_TEST ? { blocked: [], served: [] } : null;

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
}

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
    },
  });
  win.once('ready-to-show', () => {
    if (!smoke) win.show(); // the self-test runs without showing a window
  });
  win.on('closed', () => (win = null));
  win.loadURL(`${ORIGIN}/index.html#/`);
  if (smoke) runSmokeTest(win);
}

/** Opt-in self-test (SUDOKU_SMOKE_TEST=<report.json>): checks the game loads and the network is sealed. */
function runSmokeTest(w) {
  const { writeFileSync } = require('node:fs');
  w.webContents.once('did-finish-load', async () => {
    const report = { ...smoke, checks: {} };
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
    } catch (e) {
      report.error = String(e);
    }
    report.blocked = smoke.blocked;
    writeFileSync(process.env.SUDOKU_SMOKE_TEST, JSON.stringify(report, null, 2));
    app.quit();
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle(SCHEME, serve);
  lockDown();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
