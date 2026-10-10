// Windows app updates. A few seconds after start (unless turned off in
// Settings) and whenever the player asks, the app asks GitHub whether a newer
// version exists. Nothing is downloaded or installed without the player's
// say-so, every download is signature-checked before it can be installed, and
// a failed or offline check never affects the game.

import type { DesktopBridge } from './desktop.ts';

/** Why an update step failed (set by the app in desktop/src-tauri/src/lib.rs). */
export type UpdateFailure = 'offline' | 'unavailable' | 'verify' | 'failed';

interface Versions {
  current: string;
  version: string;
}

export type UpdateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'latest'; current: string }
  /** A newer version can be downloaded and installed from inside the app. */
  | ({ phase: 'available' } & Versions)
  /** A newer version exists, but this copy can't install it itself. */
  | ({ phase: 'manual' } & Versions)
  | ({ phase: 'downloading'; percent: number } & Versions)
  /** Downloaded and its signature verified; waiting for the player to confirm. */
  | ({ phase: 'ready' } & Versions)
  | ({ phase: 'installing' } & Versions)
  | { phase: 'error'; step: 'check' | 'download' | 'install'; reason: UpdateFailure; current?: string; version?: string };

/**
 * Compares version numbers like "1.10.0" and "1.9.2" part by part (numerically,
 * not as text). A pre-release ("1.2.0-beta") sorts before its release.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [main = '', pre = ''] = v.trim().replace(/^v/i, '').split('-', 2);
    return { parts: main.split('.').map((p) => Number.parseInt(p, 10) || 0), pre };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.parts.length, y.parts.length); i++) {
    const d = (x.parts[i] ?? 0) - (y.parts[i] ?? 0);
    if (d) return Math.sign(d);
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}

/**
 * The "What's New" points of a release, from the Markdown notes published
 * with it (desktop/release-notes/<version>.md). Shown as plain text only.
 */
export function parseReleaseNotes(md: string | null | undefined, max = 8): string[] {
  const clean = (s: string) => {
    const t = s
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links and images: keep the text
      .replace(/`([^`]*)`/g, '$1')
      .replace(/(\*\*|__)(.+?)\1/g, '$2')
      .replace(/(^|\s)[*_](\S(?:.*?\S)?)[*_](?=\s|[.,;:!?]|$)/g, '$1$2')
      .replace(/\s+/g, ' ')
      .trim();
    return t.length > 200 ? `${t.slice(0, 199)}…` : t;
  };
  const lines = (md ?? '').split(/\r?\n/).map((l) => l.trim());
  const bullets = lines.map((l) => /^(?:[-*+•]|\d+[.)])\s+(.+)$/.exec(l)?.[1]).filter((l): l is string => !!l);
  const text = bullets.length ? bullets : lines.filter((l) => l && !/^(#|<!--|---|===)/.test(l));
  return text.map(clean).filter(Boolean).slice(0, max);
}

export function failureReason(err: unknown): UpdateFailure {
  const msg = String(err instanceof Error ? err.message : err);
  return msg === 'offline' || msg === 'unavailable' || msg === 'verify' ? msg : 'failed';
}

export class UpdateController {
  state: UpdateState = { phase: 'idle' };
  /** The installed version, once known. */
  current: string | null = null;
  /** "What's New" in the newer version, from its release notes (may be empty). */
  whatsNew: string[] = [];
  private listeners = new Set<(s: UpdateState) => void>();
  private inFlight: Promise<UpdateState> | null = null;
  private readonly bridge: DesktopBridge;

  constructor(bridge: DesktopBridge) {
    this.bridge = bridge;
  }

  subscribe(fn: (s: UpdateState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(s: UpdateState): void {
    this.state = s;
    for (const fn of [...this.listeners]) fn(s);
  }

  /** The newer version we know about, if any (for the badge on Home). */
  get newVersion(): string | null {
    const s = this.state;
    return 'version' in s && s.version && s.phase !== 'error' ? s.version : null;
  }

  /**
   * Asks GitHub for the latest version. A silent check (at startup) never
   * shows "checking" or errors: offline simply means nothing happens.
   */
  check(opts: { silent?: boolean } = {}): Promise<UpdateState> {
    const p = this.state.phase;
    if (p === 'downloading' || p === 'ready' || p === 'installing') return Promise.resolve(this.state);
    if (!opts.silent) this.set({ phase: 'checking' });
    if (this.inFlight) return this.inFlight;
    const before = this.state;
    this.inFlight = (async () => {
      try {
        const res = await this.bridge.checkForUpdate();
        this.current = res.current;
        if (res.status === 'available' && res.version && compareVersions(res.version, res.current) > 0) {
          const v = { current: res.current, version: res.version };
          this.whatsNew = parseReleaseNotes(res.notes);
          this.set(res.portable ? { phase: 'manual', ...v } : { phase: 'available', ...v });
        } else {
          this.set({ phase: 'latest', current: res.current });
        }
      } catch (e) {
        if (this.state.phase === 'checking') this.set({ phase: 'error', step: 'check', reason: failureReason(e), current: this.current ?? undefined });
        else this.set(before);
      } finally {
        this.inFlight = null;
      }
      return this.state;
    })();
    return this.inFlight;
  }

  /** Downloads the available update and verifies its signature. */
  async download(): Promise<void> {
    const s = this.state;
    if (s.phase !== 'available') return;
    const v = { current: s.current, version: s.version };
    this.set({ phase: 'downloading', percent: 0, ...v });
    const stop = this.bridge.onProgress((percent) => {
      if (this.state.phase === 'downloading' && percent !== this.state.percent) this.set({ ...this.state, percent });
    });
    try {
      await this.bridge.downloadUpdate();
      this.set({ phase: 'ready', ...v });
    } catch (e) {
      this.set({ phase: 'error', step: 'download', reason: failureReason(e), ...v });
    } finally {
      stop();
    }
  }

  /**
   * Installs the downloaded update. Only call this after the player confirmed.
   * On success the app closes and the installer reopens the new version.
   */
  async install(): Promise<void> {
    const s = this.state;
    if (s.phase !== 'ready') return;
    const v = { current: s.current, version: s.version };
    this.set({ phase: 'installing', ...v });
    try {
      await this.bridge.installUpdate();
    } catch (e) {
      this.set({ phase: 'error', step: 'install', reason: failureReason(e), ...v });
    }
  }

  openReleasePage(): void {
    void this.bridge.openReleasesPage().catch(() => undefined);
  }
}
