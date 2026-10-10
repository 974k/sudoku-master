// Injected by the Windows app before the game loads (see lib.rs). It gives the
// game the same small `window.sudokuDesktop` bridge the web code expects
// (src/ui/desktop.ts) and moves progress over from the 1.0.x app once.
(() => {
  const invoke = (cmd, args) => window.__TAURI_INTERNALS__.invoke(cmd, args);

  // One-time import of progress saved by the previous (Electron) version.
  const legacy = __LEGACY_DATA__;
  if (legacy) {
    try {
      const fresh = !Object.keys(localStorage).some((k) => k.startsWith('sudoku-master:'));
      if (fresh) for (const [k, v] of Object.entries(legacy)) localStorage.setItem(k, v);
      window.__sudokuLegacyImport = fresh ? Object.keys(legacy).length : 0;
      invoke('legacy_import_done');
    } catch {
      /* storage unavailable right now: offered again next launch */
    }
  }

  // An app, not a browser: no Back / Refresh / Print context menu.
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  const bridge = {
    info: () => invoke('desktop_info'),
    checkForUpdate: () => invoke('update_check'),
    downloadUpdate: () => invoke('update_download'),
    installUpdate: () => invoke('update_install'),
    openReleasesPage: () => invoke('open_releases_page'),
    onProgress: (callback) => {
      let stopped = false;
      (async () => {
        while (!stopped) {
          const pct = await invoke('update_progress').catch(() => null);
          if (!stopped && pct !== null) callback(pct);
          await new Promise((r) => setTimeout(r, 250));
        }
      })();
      return () => {
        stopped = true;
      };
    },
  };
  Object.defineProperty(window, 'sudokuDesktop', { value: Object.freeze(bridge) });
})();
