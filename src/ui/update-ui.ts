// Windows app only: the update dialog (an "Update available" popup with
// What's New once a newer version is known) and the update button on Home.
// In the web version `updates` is null and none of this appears.

import { confirmDialog, progressBar } from './components.ts';
import { desktop } from './desktop.ts';
import { h } from './dom.ts';
import { icon } from './icons.ts';
import { UpdateController, type UpdateState } from './updates.ts';

export const updates: UpdateController | null = desktop ? new UpdateController(desktop) : null;

/** Screens where a popup would get in the way of play. */
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

  const dlg = h('dialog', { class: 'dialog update-dialog', 'aria-labelledby': 'upd-title' });
  const title = h('span', { text: 'App updates' });
  const installed = h('dd', { text: u.current ?? '…' });
  if (!u.current) void desktop?.info().then((i) => i && !u.current && (installed.textContent = i.version), () => undefined);
  const latest = h('dd', { text: '…' });
  const versions = h('dl', { class: 'update-versions' }, h('dt', { text: 'Installed version' }), installed, h('dt', { text: 'Available version' }), latest);
  // shown once a newer version is known
  const heroVersion = h('strong');
  const heroNote = h('small');
  const hero = h('div', { class: 'update-hero' }, heroVersion, heroNote);
  const whatsNew = h('section', { class: 'whats-new', 'aria-labelledby': 'upd-new' });
  const message = h('p', { class: 'update-msg', role: 'status', 'aria-live': 'polite' });
  const extra = h('div', { class: 'update-extra' });
  const actions = h('div', { class: 'dialog-actions' });
  dlg.append(h('h2', { id: 'upd-title' }, icon('download'), title), versions, hero, whatsNew, message, extra, actions);

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
    // a newer version: headline it, with what's new in it
    const newer = s.phase === 'available' || s.phase === 'manual' || s.phase === 'downloading' || s.phase === 'ready' || s.phase === 'installing' ? s : null;
    title.textContent = newer ? 'Update available' : 'App updates';
    versions.hidden = !!newer;
    hero.hidden = !newer;
    if (newer) {
      heroVersion.textContent = `Sudoku Master ${newer.version}`;
      heroNote.textContent = `You have version ${newer.current}`;
    }
    whatsNew.hidden = !newer || !u.whatsNew.length;
    if (newer && u.whatsNew.length && !whatsNew.childElementCount) {
      whatsNew.append(h('h3', { id: 'upd-new', text: "What's New" }), h('ul', null, u.whatsNew.map((item) => h('li', { text: item }))));
    }
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
        message.textContent = "It downloads from GitHub and its signature is checked before anything is installed. You'll be asked before it installs.";
        buttons = [button('Later', 'ghost', close), button('Update Now', 'primary', () => void u.download())];
        break;
      case 'manual':
        message.textContent = "This copy can't update itself, so please download the new version from the release page.";
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
// startup check

/** Opens the "Update available" popup once, but never in the middle of a game or over another dialog. */
function announce(): void {
  let timer = 0;
  const stop = () => {
    clearInterval(timer);
    window.removeEventListener('hashchange', tryShow);
  };
  function tryShow(): void {
    if (openDialog) return stop(); // the player already opened it
    if (playing() || document.querySelector('dialog[open]')) return;
    stop();
    openUpdateDialog();
  }
  timer = window.setInterval(tryShow, 2000);
  window.addEventListener('hashchange', tryShow);
  tryShow();
}

/** Checks GitHub quietly a few seconds after start, if the player allows it. */
export function startUpdateCheck(enabled: () => boolean, delayMs = 4000): void {
  const u = updates;
  if (!u) return;
  setTimeout(async () => {
    if (!enabled()) return;
    const s = await u.check({ silent: true });
    if (s.phase === 'available' || s.phase === 'manual') announce();
  }, delayMs);
}
