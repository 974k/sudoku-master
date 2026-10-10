// Windows app only: the update dialog, the discreet "new version" banner and
// the update button on Home. In the web version `updates` is null and none of
// this appears.

import { confirmDialog, progressBar } from './components.ts';
import { desktop } from './desktop.ts';
import { h } from './dom.ts';
import { icon } from './icons.ts';
import { UpdateController, type UpdateState } from './updates.ts';

export const updates: UpdateController | null = desktop ? new UpdateController(desktop) : null;

/** Screens where a banner would get in the way of play. */
const playing = () => /^#\/(play|tutorial)\//.test(location.hash);

const ERRORS = {
  'check:offline': "Couldn't reach GitHub. Check your internet connection and try again. The game works normally without it.",
  'check:unavailable': "GitHub didn't send update information right now. Try again later, or get the update from the release page.",
  'check:failed': "Couldn't check for updates right now. Try again later, or visit the release page.",
  'download:offline': 'The download was interrupted. Check your internet connection and try again.',
  'download:unavailable': "The update couldn't be downloaded from GitHub right now. Try again later, or use the release page.",
  'download:verify': "The downloaded update didn't pass the security check, so it was not installed and nothing was changed. Please get the update from the official release page.",
  'download:failed': "The update couldn't be downloaded. Your current version still works; try again or use the release page.",
  'install:verify': "The update didn't pass the security check, so it was not installed. Please get the update from the official release page.",
  'install:failed': "The update couldn't be installed. Your current version still works and your progress is safe. You can install it from the release page instead.",
} as Record<string, string>;

function errorText(s: Extract<UpdateState, { phase: 'error' }>): string {
  return ERRORS[`${s.step}:${s.reason}`] ?? ERRORS[`${s.step}:failed`] ?? ERRORS['check:failed']!;
}

let openDialog: HTMLDialogElement | null = null;

/** Opens the update dialog, checking GitHub right away unless an update is already under way. */
export function openUpdateDialog(): void {
  const u = updates;
  if (!u) return;
  if (openDialog) return openDialog.focus();
  dismissBanner();

  const dlg = h('dialog', { class: 'dialog update-dialog', 'aria-labelledby': 'upd-title' });
  const installed = h('dd', { text: u.current ?? '…' });
  if (!u.current) void desktop?.info().then((i) => i && !u.current && (installed.textContent = i.version), () => undefined);
  const latest = h('dd', { text: '…' });
  const message = h('p', { class: 'update-msg', role: 'status', 'aria-live': 'polite' });
  const extra = h('div', { class: 'update-extra' });
  const actions = h('div', { class: 'dialog-actions' });
  dlg.append(
    h('h2', { id: 'upd-title' }, icon('download'), ' App updates'),
    h('dl', { class: 'update-versions' }, h('dt', { text: 'Installed version' }), installed, h('dt', { text: 'Available version' }), latest),
    message,
    extra,
    actions,
  );

  const close = () => {
    off();
    openDialog = null;
    if (dlg.open) dlg.close();
    dlg.remove();
  };
  const button = (text: string, cls: string, onClick: () => void) => h('button', { type: 'button', class: `btn ${cls}`, text, onClick });
  const releaseBtn = () => button('Release page', 'ghost', () => u.openReleasePage());

  const confirmInstall = async (version: string) => {
    const ok = await confirmDialog({
      title: `Install version ${version}?`,
      message: 'Sudoku Master will close, install the update and open again by itself. Your progress, statistics, settings and unfinished games are kept.',
      confirm: 'Install and restart',
      cancel: 'Not now',
    });
    if (ok) await u.install();
  };

  const render = (s: UpdateState) => {
    if (u.current) installed.textContent = u.current;
    latest.textContent = 'version' in s && s.version ? s.version : s.phase === 'latest' ? `${s.current} (latest)` : s.phase === 'checking' ? 'Checking…' : '—';
    extra.replaceChildren();
    let buttons: HTMLElement[] = [];
    switch (s.phase) {
      case 'idle':
      case 'checking':
        message.textContent = 'Checking GitHub for a newer version…';
        buttons = [button('Close', 'ghost', close)];
        break;
      case 'latest':
        message.textContent = 'You have the latest version.';
        buttons = [button('Close', 'ghost', close), button('Check again', 'primary', () => void u.check())];
        break;
      case 'available':
        message.textContent = `Version ${s.version} is available. It downloads from GitHub, and its signature is checked before anything is installed.`;
        buttons = [button('Later', 'ghost', close), button('Download', 'primary', () => void u.download())];
        break;
      case 'manual':
        message.textContent = `Version ${s.version} is available. This copy can't update itself, so please download it from the release page.`;
        buttons = [button('Close', 'ghost', close), button('Open release page', 'primary', () => u.openReleasePage())];
        break;
      case 'downloading':
        message.textContent = `Downloading version ${s.version}… ${s.percent}%`;
        extra.append(progressBar(s.percent / 100, 'Download progress'));
        buttons = [button('Hide', 'ghost', close)];
        break;
      case 'ready':
        message.textContent = `Version ${s.version} is downloaded and its signature is verified. Install it when you're ready; you'll be asked to confirm.`;
        buttons = [button('Later', 'ghost', close), button('Install and restart', 'primary', () => void confirmInstall(s.version))];
        break;
      case 'installing':
        message.textContent = `Installing version ${s.version}. Sudoku Master will close and open again in a moment.`;
        break;
      case 'error':
        message.textContent = errorText(s);
        buttons = [button('Close', 'ghost', close), releaseBtn(), button('Try again', 'primary', () => void u.check())];
        break;
    }
    actions.replaceChildren(...buttons);
    if (dlg.open && !dlg.contains(document.activeElement)) (actions.lastElementChild as HTMLElement | null)?.focus();
  };

  const off = u.subscribe(render);
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (u.state.phase !== 'installing') close();
  });
  document.body.appendChild(dlg);
  openDialog = dlg;
  render(u.state);
  dlg.showModal();
  (actions.lastElementChild as HTMLElement | null)?.focus();
  const p = u.state.phase;
  if (p === 'idle' || p === 'latest' || p === 'error') void u.check();
}

/** The small update button on Home, with a dot once a newer version is known. */
export function updateButton(): HTMLElement | null {
  const u = updates;
  if (!u) return null;
  const dot = h('span', { class: 'update-dot', hidden: true });
  const btn = h('button', { type: 'button', class: 'icon-btn home-update', onClick: openUpdateDialog }, icon('download'), dot);
  const refresh = () => {
    const v = u.newVersion;
    dot.hidden = !v;
    const label = v ? `Update available: version ${v}` : 'Check for updates';
    btn.setAttribute('aria-label', label);
    btn.title = label;
  };
  refresh();
  const off = u.subscribe(() => (btn.isConnected ? refresh() : off()));
  return btn;
}

// ---------------------------------------------------------------------------
// startup check and banner

let banner: HTMLElement | null = null;
let bannerTimer = 0;

function dismissBanner(): void {
  clearTimeout(bannerTimer);
  banner?.remove();
  banner = null;
}

function showBanner(version: string): void {
  dismissBanner();
  banner = h(
    'div',
    { class: 'update-banner', role: 'status' },
    icon('download'),
    h('span', { text: `Version ${version} is available` }),
    h('button', { type: 'button', class: 'btn primary small', text: 'View', onClick: openUpdateDialog }),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Dismiss', title: 'Dismiss', onClick: dismissBanner }, icon('close')),
  );
  document.body.appendChild(banner);
  bannerTimer = window.setTimeout(dismissBanner, 15_000);
}

/** Tells the player about a new version once, but never in the middle of a game. */
function announce(version: string): void {
  const show = () => {
    if (playing()) return;
    window.removeEventListener('hashchange', show);
    if (!openDialog) showBanner(version);
  };
  window.addEventListener('hashchange', show);
  window.addEventListener('hashchange', () => playing() && dismissBanner());
  show();
}

/** Checks GitHub quietly a few seconds after start, if the player allows it. */
export function startUpdateCheck(enabled: () => boolean, delayMs = 4000): void {
  const u = updates;
  if (!u) return;
  setTimeout(async () => {
    if (!enabled()) return;
    const s = await u.check({ silent: true });
    if (s.phase === 'available' || s.phase === 'manual') announce(s.version);
  }, delayMs);
}
