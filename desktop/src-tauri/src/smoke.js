// Opt-in self-test, run only when SUDOKU_SMOKE_TEST is set (see lib.rs).
// Modes (SUDOKU_SMOKE_UPDATE):
//   ""       basic checks
//   "check"  ask GitHub for an update through the bridge
//   "auto"   the quiet startup check: no popup during a game, "Update available" afterwards if newer
//   "ui"     Settings → Check for updates like a player: download, confirm, install (installs!)
//   "window" F11 full screen and window transparency (the window is shown)
(async () => {
  const MODE = __MODE__;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const report = { mode: MODE, checks: {}, installing: false };
  const c = report.checks;
  const app = window.sudokuDesktop;
  const buttonByText = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
  const key = (k) => (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const size = () => {
    const b = document.querySelector('.board-wrap')?.getBoundingClientRect();
    return { w: window.innerWidth, h: window.innerHeight, x: window.screenX, y: window.screenY, fullscreenLayout: document.documentElement.hasAttribute('data-fullscreen'), board: b ? `${Math.round(b.width)} at ${Math.round(b.left)},${Math.round(b.top)}` : null };
  };
  try {
    await wait(1200);
    c.title = document.title;
    c.homeButtons = [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 7);
    c.homeChips = document.querySelector('.chips')?.innerText.replace(/\s+/g, ' ') ?? null;
    c.updateButton = document.querySelector('.home-update')?.getAttribute('aria-label') ?? null;
    c.legacyImported = window.__sudokuLegacyImport ?? null;
    c.hasProfile = localStorage.getItem('sudoku-master:profile') !== null;
    // written by the "ui" test just before it confirmed an update
    c.updateMarker = localStorage.getItem('sudoku-master:update-test');
    localStorage.removeItem('sudoku-master:update-test');
    location.hash = '#/play/beginner-1-1';
    await wait(800);
    c.boardCells = document.querySelectorAll('[role=gridcell]').length;
    c.pageFetchExternal = await fetch('https://example.com/collect').then(() => 'SENT', (e) => 'blocked: ' + e.message);
    c.imageBeacon = await new Promise((r) => {
      const i = new Image();
      i.onload = () => r('SENT');
      i.onerror = () => r('blocked');
      i.src = 'https://example.com/pixel.gif';
    });
    localStorage.setItem('sudoku-master:smoke', '1');
    c.storageWorks = localStorage.getItem('sudoku-master:smoke') === '1';
    localStorage.removeItem('sudoku-master:smoke');
    c.serviceWorkers = navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 'n/a';
    c.bridge = typeof app;
    c.bridgeMethods = Object.keys(app ?? {});
    c.desktopInfo = await app.info();

    if (MODE === 'check') {
      c.update = await app.checkForUpdate().catch((e) => ({ error: String(e) }));
    } else if (MODE === 'auto') {
      // still in a game when the startup check (4 s) finishes
      await wait(6500);
      c.popupDuringGame = !!document.querySelector('dialog[open]');
      c.stillOnGame = location.hash;
      location.hash = '#/';
      await wait(900);
      const popup = document.querySelector('.update-dialog[open]');
      c.popupAfterGame = popup
        ? {
            title: popup.querySelector('h2')?.textContent,
            version: popup.querySelector('.update-hero')?.innerText.replace(/\s+/g, ' '),
            whatsNew: [...popup.querySelectorAll('.whats-new li')].map((li) => li.textContent),
            buttons: [...popup.querySelectorAll('.dialog-actions button')].map((b) => b.textContent),
          }
        : null;
      c.updateButtonAfter = document.querySelector('.home-update')?.getAttribute('aria-label') ?? null;
      c.updateDotShown = document.querySelector('.update-dot') ? !document.querySelector('.update-dot').hidden : null;
    } else if (MODE === 'ui') {
      location.hash = '#/settings';
      await wait(600);
      c.settingsStatus = [...document.querySelectorAll('.set-row')].find((r) => r.textContent.includes('App updates'))?.querySelector('small')?.textContent;
      buttonByText(document, 'Check for updates').click();
      const dlg = () => document.querySelector('.update-dialog');
      const seen = [];
      const progress = [];
      const note = () => {
        const msg = dlg()?.querySelector('.update-msg')?.textContent ?? '';
        const pct = /(\d+)%$/.exec(msg)?.[1];
        if (pct && progress[progress.length - 1] !== +pct) progress.push(+pct);
        const isProgress = /\d+%$/.test(msg);
        if (msg && seen[seen.length - 1] !== msg && (!isProgress || !seen.some((x) => /\d+%$/.test(x)) || /100%$/.test(msg))) seen.push(msg);
        return msg;
      };
      const until = async (re, ms) => {
        for (let t = 0; t < ms / 100; t++) {
          if (re.test(note())) return true;
          await wait(100);
        }
        return false;
      };
      await until(/latest version|downloads from GitHub|can't update itself|Couldn't|didn't|couldn't/, 30000);
      const shown = [...(dlg()?.querySelectorAll('.update-versions, .update-hero') ?? [])].find((el) => !el.hidden);
      c.versionsShown = shown?.innerText.replace(/\s+/g, ' ');
      c.whatsNew = [...(dlg()?.querySelectorAll('.whats-new:not([hidden]) li') ?? [])].map((li) => li.textContent);
      const download = buttonByText(dlg(), 'Update Now');
      if (download) {
        download.click();
        await until(/verified|Couldn't|didn't|couldn't|interrupted/, 120000);
        const install = buttonByText(dlg(), 'Install and restart');
        if (install) {
          install.click();
          await wait(400);
          const confirm = [...document.querySelectorAll('dialog[open]')].find((d) => !d.classList.contains('update-dialog'));
          c.confirmation = confirm ? confirm.innerText.replace(/\s+/g, ' ') : null;
          // nothing is installed until the player confirms (the app would have closed)
          await wait(1500);
          if (confirm) {
            // saved a moment before installing: must still be there after the restart
            localStorage.setItem('sudoku-master:update-test', `written by ${c.desktopInfo.version} at ${new Date().toISOString()}`);
            report.installing = true;
            await window.__TAURI_INTERNALS__.invoke('smoke_report', { report: { ...report, checks: { ...c, uiMessages: seen, progress } } });
            buttonByText(confirm, 'Install and restart').click();
            await until(/Installing version|couldn't be installed|security check/, 15000);
            report.installing = /Installing version/.test(seen[seen.length - 1] ?? '');
          }
        }
      }
      c.uiMessages = seen;
      c.progress = progress;
      c.buttons = [...(dlg()?.querySelectorAll('.dialog-actions button') ?? [])].map((b) => b.textContent);
    } else if (MODE === 'window') {
      await wait(500);
      c.before = size();
      c.screen = { w: screen.width, h: screen.height };
      // game input works while full screen: select an empty cell, type a digit
      key('F11');
      await wait(1500);
      c.fullscreen = { state: await app.isFullscreen(), ...size() };
      await wait(Number(__HOLD_MS__)); // the outside test script screenshots the full-screen game here
      const cell = [...document.querySelectorAll('[role=gridcell]')].find((el) => !el.textContent.trim());
      cell?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      cell?.click();
      key('5');
      await wait(300);
      c.typedInFullscreen = cell ? cell.textContent.trim().slice(0, 1) : null;
      c.exitPillShown = document.querySelector('.fs-exit.show')?.textContent ?? null;
      key('F11');
      await wait(1500);
      c.afterExit = { state: await app.isFullscreen(), ...size() };
      // transparency through the Settings controls
      location.hash = '#/settings';
      await wait(700);
      const sw = document.querySelector('[aria-label="Window transparency"]');
      c.transparencyStartsOff = sw?.getAttribute('aria-checked') === 'false';
      sw?.click();
      await wait(300);
      const slider = document.querySelector('input.range');
      slider.value = '50';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
      c.transparencyOn = sw?.getAttribute('aria-checked');
      c.opacityLabel = document.querySelector('.range-value')?.textContent;
      // the outside test script screenshots and inspects the window here
      await wait(Number(__HOLD_MS__));
      key('F11');
      await wait(Number(__HOLD_MS__));
      key('F11');
      await wait(Number(__HOLD_MS__));
      buttonByText(document, 'Restore full opacity').click();
      await wait(400);
      c.afterRestore = { switch: sw?.getAttribute('aria-checked'), sliderDisabled: slider.disabled };
      await wait(Number(__HOLD_MS__));
    }
  } catch (e) {
    report.error = String(e);
  }
  await window.__TAURI_INTERNALS__.invoke('smoke_report', { report });
})();
