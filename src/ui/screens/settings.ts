import { MIN_WINDOW_OPACITY, type Settings } from '../../game/settings.ts';
import type { ScreenFactory } from '../app.ts';
import { confirmDialog, segmented, toast, toggle, topBar } from '../components.ts';
import { desktop } from '../desktop.ts';
import { h, type Child } from '../dom.ts';
import { icon } from '../icons.ts';
import { openUpdateDialog, updates } from '../update-ui.ts';
import type { UpdateState } from '../updates.ts';
import { windowLook } from '../window-ui.ts';

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

  // Windows app only: updates come from GitHub, only with the player's go-ahead.
  let stopUpdates: (() => void) | null = null;
  const updateRows = (): HTMLElement[] => {
    const u = updates;
    if (!u) return [];
    const label = h('span', { class: 'set-label', text: 'App updates' });
    const status = h('small');
    void desktop?.info().then((i) => i && (label.textContent = `App updates · version ${i.version}`), () => undefined);
    const describe = (st: UpdateState): string => {
      switch (st.phase) {
        case 'checking':
          return 'Checking for a newer version…';
        case 'latest':
          return `You have the latest version (${st.current}).`;
        case 'available':
        case 'manual':
          return `Version ${st.version} is available.`;
        case 'downloading':
          return `Downloading version ${st.version}… ${st.percent}%`;
        case 'ready':
          return `Version ${st.version} is downloaded and ready to install.`;
        case 'installing':
          return `Installing version ${st.version}…`;
        default:
          return 'Updates come from GitHub and are signature-checked. No game data is sent.';
      }
    };
    const refresh = (st: UpdateState) => (status.textContent = describe(st));
    refresh(u.state);
    stopUpdates = u.subscribe(refresh);
    return [
      // full-width text (like the other stacked rows), button below
      h(
        'div',
        { class: 'set-row stack' },
        h('div', { class: 'set-text', css: { 'align-self': 'stretch' } }, label, status),
        h('button', { type: 'button', class: 'btn primary small', text: 'Check for updates', onClick: openUpdateDialog }),
      ),
      sw('autoUpdateCheck', 'Check for updates at startup', 'Quietly asks GitHub if a newer version exists. You decide whether to install it.'),
    ];
  };

  // Windows app only: see-through window. Always starts off.
  const transparencyRows = (): HTMLElement[] => {
    if (!desktop) return [];
    const min = Math.round(MIN_WINDOW_OPACITY * 100);
    const slider = h('input', { type: 'range', class: 'range', min: String(min), max: '100', step: '5', 'aria-labelledby': 'set-opacity-label' });
    slider.value = String(Math.round(s.windowOpacity * 100));
    const value = h('span', { class: 'range-value', 'aria-hidden': 'true' });
    const restore = h('button', { type: 'button', class: 'btn ghost small', text: 'Restore full opacity' });
    const level = () => Number(slider.value) / 100;
    const sync = () => {
      const on = windowLook.transparent;
      swt.setAttribute('aria-checked', String(on));
      slider.disabled = !on;
      restore.disabled = !on;
      value.textContent = `${slider.value}%`;
    };
    const apply = async (on: boolean) => {
      if (!(await windowLook.set(on, level())) && on) toast("Windows didn't allow transparency for this window.", { icon: 'info' });
      sync();
    };
    const swt = toggle(windowLook.transparent, (on) => void apply(on), 'Window transparency');
    slider.addEventListener('input', () => {
      value.textContent = `${slider.value}%`;
      void windowLook.set(true, level());
    });
    slider.addEventListener('change', () => set({ windowOpacity: level() }));
    restore.addEventListener('click', () => void apply(false));
    sync();
    return [
      row('Window transparency', 'See through the whole game window. Always off when the app starts.', swt, 'set-transparency'),
      h(
        'div',
        { class: 'set-row', css: { 'flex-wrap': 'wrap' } },
        h('div', { class: 'set-text' }, h('span', { id: 'set-opacity-label', class: 'set-label', text: 'Opacity' }), h('small', { text: `From ${min}% (most see-through) to 100%.` })),
        h('div', { class: 'range-wrap' }, slider, value),
      ),
      h('div', { class: 'set-row', css: { 'flex-wrap': 'wrap' } }, h('div', { class: 'set-text' }, h('small', { text: 'Back to a normal, solid window.' })), restore),
    ];
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
        transparencyRows(),
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
        updateRows(),
      ),
    ),
  );
  return { el, title: 'Settings', destroy: () => stopUpdates?.() };
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
      h('p', { text: 'A few seconds after it starts, the Windows app asks GitHub, where the app is published, whether a newer version exists. You can turn this off in Settings → Check for updates at startup, and check by hand at any time. If there is a new version you are told about it, and nothing is downloaded or installed unless you choose to. Every update is signed, and the app refuses to install one whose signature does not match.' }),
      h('p', { text: 'Like any download, GitHub sees the request (for example your IP address), but no game data is ever included. Without a connection the check simply fails quietly and the game works as usual.' }),
      h('h2', { text: 'Microsoft Edge WebView2 (Windows app)' }),
      h('p', { text: 'The Windows app shows the game using Microsoft Edge WebView2, a component built into Windows. The game blocks all internet access from inside it, but Windows itself may send Microsoft diagnostic data about its components according to your Windows settings (Settings → Privacy & security → Diagnostics & feedback). Your game progress is never part of that.' }),
    ),
  );
  return { el, title: 'Privacy' };
};
