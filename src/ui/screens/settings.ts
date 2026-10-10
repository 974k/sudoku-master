import type { Settings } from '../../game/settings.ts';
import type { ScreenFactory } from '../app.ts';
import { confirmDialog, segmented, toast, toggle, topBar } from '../components.ts';
import { desktop } from '../desktop.ts';
import { h, type Child } from '../dom.ts';
import { icon } from '../icons.ts';

export const settingsScreen: ScreenFactory = (ctx) => {
  const { store } = ctx;
  const s = store.settings;
  const set = (patch: Partial<Settings>) => store.updateSettings(patch);

  const row = (label: string, desc: string | null, control: HTMLElement, id: string): HTMLElement => {
    if (desc) control.setAttribute('aria-describedby', `${id}-desc`);
    control.setAttribute('aria-labelledby', `${id}-label`);
    return h(
      'div',
      { class: 'set-row' },
      h('div', { class: 'set-text' }, h('span', { id: `${id}-label`, class: 'set-label', text: label }), desc ? h('small', { id: `${id}-desc`, text: desc }) : null),
      control,
    );
  };
  const sw = (key: keyof Settings, label: string, desc: string | null) =>
    row(label, desc, toggle(Boolean(s[key]), (v) => set({ [key]: v } as Partial<Settings>), label), `set-${key}`);
  const section = (title: string, ...rows: Child[]) => h('section', { class: 'set-section' }, h('h2', { class: 'section-title', text: title }), h('div', { class: 'set-card' }, rows));

  const usage = h('small', { text: '' });
  const refreshUsage = () => (usage.textContent = store.storage.persistent ? `About ${Math.max(1, Math.round(store.storage.usage() / 1024))} KB stored in this browser.` : 'Storage is unavailable in this browser mode; nothing is saved.');
  refreshUsage();

  const offline = h('small', { text: 'Checking…' });
  if (desktop) offline.textContent = 'Works fully offline.';
  else if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then(
      (r) => (offline.textContent = r?.active ? 'Ready to play offline.' : 'Offline mode activates after the first load of the installed app.'),
      () => (offline.textContent = 'Offline mode unavailable in this browser.'),
    );
  } else offline.textContent = 'Offline mode unavailable in this browser.';

  // Windows app only: one click checks GitHub, downloads, installs and restarts.
  let stopProgress: (() => void) | null = null;
  const updateRow = (): HTMLElement | null => {
    if (!desktop) return null;
    const bridge = desktop;
    const status = h('small', { text: 'Contacts GitHub only when you click. No game data is sent.' });
    const label = h('span', { class: 'set-label', text: 'App updates' });
    const btn = h('button', { type: 'button', class: 'btn primary small', text: 'Check for updates' });
    void bridge.info().then((i) => i && (label.textContent = `App updates · version ${i.version}`));
    let next: (() => void) | null = null;
    const idle = (text: string, button: string, action: () => void = run) => {
      status.textContent = text;
      btn.textContent = button;
      btn.disabled = false;
      next = action;
    };
    async function run(): Promise<void> {
      btn.disabled = true;
      btn.textContent = 'Checking…';
      status.textContent = 'Looking for a newer version…';
      try {
        const res = await bridge.checkForUpdate();
        if (res.status === 'unsupported') return idle('Updates work in the installed app.', 'Check for updates');
        if (res.status === 'latest') return idle(`You have the latest version (${res.current}).`, 'Check again');
        if (res.portable) {
          return idle(`Version ${res.version} is available. This portable copy can't update itself; download the new version from GitHub.`, 'Open download page', () => void bridge.openReleasesPage());
        }
        btn.textContent = 'Updating…';
        status.textContent = `Downloading version ${res.version}…`;
        stopProgress = bridge.onProgress((pct) => (status.textContent = `Downloading version ${res.version}… ${pct}%`));
        await bridge.downloadUpdate();
        stopProgress();
        stopProgress = null;
        status.textContent = `Installing version ${res.version}. Sudoku Master will restart — your progress is saved.`;
        await new Promise((r) => setTimeout(r, 1500));
        await bridge.installUpdate();
      } catch {
        stopProgress?.();
        stopProgress = null;
        idle("Couldn't reach GitHub. Check your internet connection and try again.", 'Try again');
      }
    }
    next = run;
    btn.addEventListener('click', () => next?.());
    // full-width text (like the other stacked rows), button below
    return h('div', { class: 'set-row stack' }, h('div', { class: 'set-text', css: { 'align-self': 'stretch' } }, label, status), btn);
  };

  const el = h(
    'main',
    { class: 'screen' },
    topBar({ title: 'Settings', back: () => ctx.back('/') }),
    h(
      'div',
      { class: 'content narrow' },
      section(
        'Sound & feel',
        sw('sound', 'Sound effects', 'Soft tones for moves, mistakes and wins.'),
        sw('vibration', 'Vibration', 'Haptic feedback on supported phones.'),
      ),
      section(
        'Appearance',
        row(
          'Theme',
          null,
          segmented(
            [
              { value: 'system', label: 'Auto' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'sepia', label: 'Paper' },
            ] as const,
            s.theme,
            (v) => set({ theme: v }),
            'Theme',
          ),
          'set-theme',
        ),
      ),
      section(
        'Gameplay',
        sw('highlightRegion', 'Highlight row, column and box', 'Shade the area around the selected cell.'),
        sw('highlightSameNumbers', 'Highlight matching numbers', 'Shade every copy of the selected digit, including notes.'),
        sw('autoRemoveNotes', 'Auto-remove notes', 'Placing a digit clears it from notes in the same row, column and box.'),
        sw('showRemaining', 'Show remaining counts', 'Show how many of each digit are left on the number pad.'),
        sw('showTimer', 'Show timer', 'Time is still recorded for your best times when hidden.'),
      ),
      section(
        'Difficulty preferences',
        row(
          'Mistake limit',
          'End the game after this many mistakes. Applies to new games.',
          segmented(
            [
              { value: 0, label: 'Off' },
              { value: 3, label: '3' },
              { value: 5, label: '5' },
            ] as const,
            s.mistakeLimit,
            (v) => set({ mistakeLimit: v }),
            'Mistake limit',
          ),
          'set-limit',
        ),
        sw('hints', 'Hints', 'Show the hint button. Turn off to solve entirely on your own.'),
        sw('learningMode', 'Learning mode', 'Hints go straight to full explanations, and selecting a cell shows which digits fit and why.'),
        sw('unlockAll', 'Unlock all levels', 'For experienced players: open every level and stage right away.'),
      ),
      section(
        'Accessibility',
        row(
          'Text size',
          null,
          segmented(
            [
              { value: 'normal', label: 'A' },
              { value: 'large', label: 'A+' },
              { value: 'xlarge', label: 'A++' },
            ] as const,
            s.textSize,
            (v) => set({ textSize: v }),
            'Text size',
          ),
          'set-text',
        ),
        sw('highContrast', 'High contrast', 'Stronger colours, borders and text.'),
        sw('reduceMotion', 'Reduce motion', 'Turn off animations. Also follows your device setting.'),
      ),
      section(
        'Privacy & data',
        h(
          'div',
          { class: 'set-row stack' },
          h('div', { class: 'set-text' }, h('span', { class: 'set-label' }, icon('shield'), ' Everything stays on this device'), h('small', { text: 'No accounts, ads, analytics or tracking. Progress is saved only in this browser and is never uploaded.' }), usage),
          h('a', { class: 'btn ghost small', href: '#/privacy', text: 'Privacy details' }),
        ),
        h(
          'div',
          { class: 'set-row stack' },
          h('div', { class: 'set-text' }, h('span', { class: 'set-label', text: 'Reset all progress' }), h('small', { text: 'Permanently delete progress, statistics, achievements, saved games and settings from this device.' })),
          h('button', {
            type: 'button',
            class: 'btn danger small',
            text: 'Delete all data',
            onClick: async () => {
              const ok = await confirmDialog({
                title: 'Delete all data?',
                message: 'This permanently erases every puzzle record, star, achievement, statistic, saved game and setting on this device. It cannot be undone.',
                confirm: 'Delete everything',
                danger: true,
              });
              if (!ok) return;
              store.resetAll();
              toast('All game data deleted from this device.', { icon: 'check' });
              ctx.back('/');
            },
          }),
        ),
      ),
      section(
        'About',
        h('div', { class: 'set-row stack' }, h('div', { class: 'set-text' }, h('span', { class: 'set-label', text: 'Sudoku Master 1.0' }), h('small', { text: '500 hand-graded puzzles, a daily challenge, and a step-by-step hint guide. Free forever, with no ads or purchases.' }), offline)),
        updateRow(),
      ),
    ),
  );
  return { el, title: 'Settings', destroy: () => stopProgress?.() };
};

export const privacyScreen: ScreenFactory = (ctx) => {
  const item = (title: string, text: string) => h('li', null, h('strong', { text: title }), h('span', { text }));
  const el = h(
    'main',
    { class: 'screen' },
    topBar({ title: 'Privacy', back: () => ctx.back('/settings') }),
    h(
      'div',
      { class: 'content narrow prose' },
      h('p', { class: 'lead' }, icon('shield'), ' Sudoku Master collects nothing. There is no server to send anything to.'),
      h(
        'ul',
        { class: 'privacy-list' },
        item('No accounts', 'No sign-up, login, email, name or any personal details.'),
        item('No ads or tracking', 'No advertising, analytics, telemetry, crash reporting, fingerprinting, cookies or third-party code of any kind.'),
        item('No network', 'Puzzles ship inside the app and the game makes no network requests while you play. A strict Content Security Policy blocks the page from contacting any server.'),
        item('Local only', 'Progress, statistics, achievements, settings and unfinished games are stored in this browser’s local storage on this device. They are never uploaded or synced.'),
        item('No permissions', 'The game asks for no device permissions. Vibration, where available, needs no permission and can be turned off.'),
        item('You are in control', 'Settings → Reset all progress deletes everything the game has stored. Clearing this site’s data in your browser does the same.'),
      ),
      h('h2', { text: 'What is stored' }),
      h('p', { text: 'Under keys starting with “sudoku-master:” in local storage: your settings, which puzzles you solved with their stars and best times, totals used for statistics and streaks, unlocked achievements, and the state of unfinished puzzles (digits, notes, timer and undo history).' }),
      h(
        'p',
        null,
        h('strong', { text: 'All of this is stored locally, on your own device only.' }),
        ' It is not stored on our servers, it is never sent to us, and it is not shared with any other person or company. Your game progress, scores, best times, statistics, achievements, settings and unfinished games stay on your device — the game does not transmit any of it anywhere.',
      ),
      h('h2', { text: 'Offline use' }),
      h('p', { text: 'When installed or served over HTTPS, a service worker keeps a copy of the game’s own files so it works without a connection. It only ever caches the game itself.' }),
      h('p', { text: 'To receive updates, your browser may occasionally re-check those files with the website you installed the game from. That check never includes any of your game data, and the game works the same if it fails.' }),
      h('h2', { text: 'Updates in the Windows app' }),
      h('p', { text: 'The Windows app never checks for updates on its own. Only when you click Settings → Check for updates does it contact GitHub, where the app is published, to see whether a newer version exists and, if so, download and install it. Like any download, GitHub sees the request (for example your IP address), but no game data is ever included.' }),
      h('h2', { text: 'Microsoft Edge WebView2 (Windows app)' }),
      h('p', { text: 'The Windows app shows the game using Microsoft Edge WebView2, a component built into Windows. The game blocks all internet access from inside it, but Windows itself may send Microsoft diagnostic data about its components according to your Windows settings (Settings → Privacy & security → Diagnostics & feedback). Your game progress is never part of that.' }),
    ),
  );
  return { el, title: 'Privacy' };
};
