// Opt-in self-test, run only when SUDOKU_SMOKE_TEST is set (see lib.rs).
// Modes (SUDOKU_SMOKE_UPDATE): "" basic checks · "check" ask GitHub for an
// update · "ui" press Settings → Check for updates like a player (installs!).
(async () => {
  const MODE = __MODE__;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const report = { checks: {}, installing: false };
  const c = report.checks;
  try {
    await wait(1200);
    c.title = document.title;
    c.homeButtons = [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 6);
    c.homeChips = document.querySelector('.chips')?.innerText.replace(/\s+/g, ' ') ?? null;
    c.legacyImported = window.__sudokuLegacyImport ?? null;
    c.hasProfile = localStorage.getItem('sudoku-master:profile') !== null;
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
    c.bridge = typeof window.sudokuDesktop;
    c.desktopInfo = await window.sudokuDesktop.info();
    if (MODE === 'check') {
      c.update = await window.sudokuDesktop.checkForUpdate().catch((e) => ({ error: String(e) }));
    } else if (MODE === 'ui') {
      location.hash = '#/settings';
      await wait(600);
      [...document.querySelectorAll('button')].find((b) => b.textContent === 'Check for updates').click();
      const status = () => [...document.querySelectorAll('.set-row')].find((r) => r.textContent.includes('App updates'))?.querySelector('small')?.textContent ?? '';
      const seen = [];
      for (let t = 0; t < 600; t++) {
        const st = status();
        const isProgress = /\d+%$/.test(st);
        if (st && seen[seen.length - 1] !== st && (!isProgress || !seen.some((x) => /\d+%$/.test(x)))) seen.push(st);
        if (/Installing version|latest version|Couldn't reach|installed app/.test(st)) break;
        await wait(250);
      }
      c.uiStatuses = seen;
      report.installing = /Installing version/.test(seen[seen.length - 1] ?? '');
    }
  } catch (e) {
    report.error = String(e);
  }
  await window.__TAURI_INTERNALS__.invoke('smoke_report', { report });
})();
