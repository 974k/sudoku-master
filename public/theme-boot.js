// Applies the saved theme before first paint to avoid a flash of the wrong
// colours. Reads local settings only; makes no requests.
(function () {
  try {
    var raw = localStorage.getItem('sudoku-master:settings');
    var s = raw ? JSON.parse(raw) : {};
    var root = document.documentElement;
    var theme = s.theme === 'light' || s.theme === 'dark' || s.theme === 'sepia' ? s.theme : null;
    if (!theme) theme = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    root.setAttribute('data-theme', theme);
    if (s.textSize === 'large' || s.textSize === 'xlarge') root.setAttribute('data-text', s.textSize);
    if (s.highContrast === true) root.setAttribute('data-contrast', 'high');
    if (s.reduceMotion === true) root.setAttribute('data-motion', 'reduce');
  } catch (e) {
    /* storage unavailable: defaults apply */
  }
})();
