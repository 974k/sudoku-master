// Windows app only: F11 full screen and optional window transparency. Both
// are handled by the app itself (desktop/src-tauri/src/lib.rs); the web
// version has no bridge, so nothing here does anything there.

import { desktop } from './desktop.ts';
import { h } from './dom.ts';
import { icon } from './icons.ts';

// ---------------------------------------------------------------- full screen

let fullscreen = false;
let pill: HTMLButtonElement | null = null;
let pillTimer = 0;

function hidePill(): void {
  clearTimeout(pillTimer);
  pill?.classList.remove('show');
}

/** The "Exit full screen" button: shown on entering, then whenever the pointer nears the top edge. */
function showPill(ms = 2500): void {
  if (!pill) {
    pill = h('button', { type: 'button', class: 'fs-exit', tabindex: '-1', onClick: () => void toggleFullscreen() }, icon('shrink'), h('span', { text: 'Exit full screen (F11)' }));
    pill.addEventListener('pointerenter', () => clearTimeout(pillTimer));
    pill.addEventListener('pointerleave', () => showPill(1200));
    document.body.appendChild(pill);
  }
  pill.classList.add('show');
  clearTimeout(pillTimer);
  pillTimer = window.setTimeout(hidePill, ms);
}

export async function toggleFullscreen(): Promise<void> {
  if (!desktop) return;
  try {
    fullscreen = await desktop.toggleFullscreen();
  } catch {
    return;
  }
  if (fullscreen) showPill(3500);
  else hidePill();
}

// --------------------------------------------------------------- transparency

let transparent = false;

/** Window transparency. Off whenever the app starts; only the player turns it on. */
export const windowLook = {
  get transparent(): boolean {
    return transparent;
  },
  /** Applies the opacity (or full opacity when `on` is false). Resolves to false if Windows refused. */
  async set(on: boolean, opacity: number): Promise<boolean> {
    if (!desktop) return false;
    try {
      await desktop.setWindowOpacity(on ? opacity : 1);
      transparent = on;
      return true;
    } catch {
      if (on) await desktop.setWindowOpacity(1).catch(() => undefined);
      transparent = false;
      return false;
    }
  },
};

export function setupWindowControls(): void {
  if (!desktop) return;
  // F11 toggles full screen. Capture phase, so it works on every screen; the
  // game itself never uses F11.
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'F11') return;
      e.preventDefault();
      if (!e.repeat) void toggleFullscreen();
    },
    true,
  );
  window.addEventListener('pointermove', (e) => fullscreen && e.clientY < 40 && showPill(), { passive: true });
  // the app always starts as a normal, fully opaque window
  void desktop.setWindowOpacity(1).catch(() => undefined);
  void desktop.isFullscreen().then((v) => (fullscreen = v), () => undefined);
}
