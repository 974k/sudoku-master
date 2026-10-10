import { describe, expect, it } from 'vitest';
import type { DesktopBridge, UpdateCheck } from './desktop.ts';
import { UpdateController, compareVersions, parseReleaseNotes, type UpdateState } from './updates.ts';

/** A stand-in for the Windows app's bridge, scripted per test. */
function fakeBridge(o: { check?: () => Promise<UpdateCheck>; download?: () => Promise<void>; install?: () => Promise<void> } = {}) {
  const calls: string[] = [];
  let progress: ((p: number) => void) | null = null;
  const bridge: DesktopBridge = {
    info: async () => ({ version: '1.2.0', portable: false, packaged: true }),
    checkForUpdate: async () => {
      calls.push('check');
      return (o.check ?? (async () => ({ status: 'latest', current: '1.2.0' }) as UpdateCheck))();
    },
    downloadUpdate: async () => {
      calls.push('download');
      progress?.(40);
      progress?.(100);
      await (o.download ?? (async () => undefined))();
      return { status: 'ready', verified: true };
    },
    installUpdate: async () => {
      calls.push('install');
      await (o.install ?? (async () => undefined))();
    },
    openReleasesPage: async () => void calls.push('releases'),
    onProgress: (cb) => {
      progress = cb;
      return () => (progress = null);
    },
    toggleFullscreen: async () => true,
    isFullscreen: async () => false,
    setWindowOpacity: async () => undefined,
  };
  return { bridge, calls };
}

const available = (version: string, current = '1.1.0') => async (): Promise<UpdateCheck> => ({ status: 'available', current, version });
const fail = (code: string) => async (): Promise<never> => {
  throw code; // Tauri rejects invoke() with the command's error string
};

describe('version comparison', () => {
  it('compares numerically, part by part', () => {
    expect(compareVersions('1.2.0', '1.1.0')).toBe(1);
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1); // not text order
    expect(compareVersions('2.0.0', '10.0.0')).toBe(-1);
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('v1.2.1', '1.2.0')).toBe(1);
    expect(compareVersions('1.1.0', '1.1.0')).toBe(0);
    expect(compareVersions('1.0.9', '1.1.0')).toBe(-1);
  });

  it('puts pre-releases before their release', () => {
    expect(compareVersions('1.2.0-beta', '1.2.0')).toBe(-1);
    expect(compareVersions('1.2.0', '1.2.0-rc.1')).toBe(1);
    expect(compareVersions('1.2.0-beta', '1.1.9')).toBe(1);
  });
});

describe("What's New from release notes", () => {
  it('takes the bullet points of the release notes as plain text', () => {
    const md = [
      '# Sudoku Master 1.3.0',
      '',
      'A short intro line.',
      '',
      '- **Sudoku AI**: new puzzles generated on your device',
      '* Improved the [update](https://example.com) popup',
      '• Fixed `F11` returning a snapped window to the wrong size',
      '1. Faster _hints_',
    ].join('\n');
    expect(parseReleaseNotes(md)).toEqual([
      'Sudoku AI: new puzzles generated on your device',
      'Improved the update popup',
      'Fixed F11 returning a snapped window to the wrong size',
      'Faster hints',
    ]);
  });

  it('falls back to plain lines, and copes with no notes at all', () => {
    expect(parseReleaseNotes('## Heading\nBug fixes and improvements.\n<!-- comment -->')).toEqual(['Bug fixes and improvements.']);
    expect(parseReleaseNotes(null)).toEqual([]);
    expect(parseReleaseNotes('   ')).toEqual([]);
  });

  it('keeps the list short and each point readable', () => {
    const many = Array.from({ length: 20 }, (_, i) => `- point ${i}`).join('\n');
    expect(parseReleaseNotes(many)).toHaveLength(8);
    expect(parseReleaseNotes(`- ${'x'.repeat(500)}`)[0]!.length).toBe(200);
  });

  it('reaches the update popup through the update check', async () => {
    const notes = '- Added the Randomizer\n- Fixed full screen';
    const u = new UpdateController(fakeBridge({ check: async () => ({ status: 'available', current: '1.2.1', version: '1.3.0', notes }) }).bridge);
    await u.check({ silent: true });
    expect(u.whatsNew).toEqual(['Added the Randomizer', 'Fixed full screen']);
    const none = new UpdateController(fakeBridge({ check: available('1.3.0') }).bridge);
    await none.check();
    expect(none.whatsNew).toEqual([]);
  });
});

describe('update checks', () => {
  it('reports the latest version when there is nothing newer', async () => {
    const { bridge } = fakeBridge();
    const u = new UpdateController(bridge);
    expect((await u.check()).phase).toBe('latest');
    expect(u.current).toBe('1.2.0');
    expect(u.newVersion).toBeNull();
  });

  it('finds a newer version without downloading anything', async () => {
    const { bridge, calls } = fakeBridge({ check: available('1.2.0') });
    const u = new UpdateController(bridge);
    expect(await u.check({ silent: true })).toMatchObject({ phase: 'available', current: '1.1.0', version: '1.2.0' });
    expect(u.newVersion).toBe('1.2.0');
    expect(calls).toEqual(['check']);
  });

  it('never offers an older or equal version', async () => {
    for (const v of ['1.1.0', '1.0.5', '0.9.0']) {
      const u = new UpdateController(fakeBridge({ check: available(v) }).bridge);
      expect((await u.check()).phase).toBe('latest');
    }
  });

  it('stays quiet when a startup check fails (offline or GitHub down)', async () => {
    for (const code of ['offline', 'unavailable', 'something odd']) {
      const seen: UpdateState[] = [];
      const u = new UpdateController(fakeBridge({ check: fail(code) }).bridge);
      u.subscribe((s) => seen.push(s));
      expect((await u.check({ silent: true })).phase).toBe('idle');
      expect(seen.every((s) => s.phase !== 'error' && s.phase !== 'checking')).toBe(true);
    }
  });

  it('explains a failed manual check', async () => {
    const u = new UpdateController(fakeBridge({ check: fail('offline') }).bridge);
    const p = u.check();
    expect(u.state.phase).toBe('checking');
    expect(await p).toMatchObject({ phase: 'error', step: 'check', reason: 'offline' });
    const u2 = new UpdateController(fakeBridge({ check: fail('unavailable') }).bridge);
    expect(await u2.check()).toMatchObject({ reason: 'unavailable' });
  });

  it('shares one request when a manual check overlaps the startup check', async () => {
    const { bridge, calls } = fakeBridge({ check: available('1.2.0') });
    const u = new UpdateController(bridge);
    const a = u.check({ silent: true });
    const b = u.check();
    expect(u.state.phase).toBe('checking');
    await Promise.all([a, b]);
    expect(calls).toEqual(['check']);
    expect(u.state.phase).toBe('available');
  });

  it('sends copies that cannot update themselves to the release page', async () => {
    const u = new UpdateController(fakeBridge({ check: async () => ({ status: 'available', current: '1.1.0', version: '1.2.0', portable: true }) }).bridge);
    expect((await u.check()).phase).toBe('manual');
    await u.download();
    expect(u.state.phase).toBe('manual'); // nothing to download in-app
  });
});

describe('downloading and installing', () => {
  it('downloads with progress, waits for confirmation, then installs', async () => {
    const { bridge, calls } = fakeBridge({ check: available('1.2.0') });
    const u = new UpdateController(bridge);
    const percents: number[] = [];
    u.subscribe((s) => s.phase === 'downloading' && percents.push(s.percent));
    await u.install(); // nothing downloaded yet: ignored
    await u.check();
    await u.download();
    expect(percents).toEqual([0, 40, 100]);
    expect(u.state).toMatchObject({ phase: 'ready', version: '1.2.0' });
    expect(calls).toEqual(['check', 'download']); // never installs by itself
    await u.check();
    expect(u.state.phase).toBe('ready'); // a later check keeps the verified download
    await u.install();
    expect(calls).toEqual(['check', 'download', 'install']);
    expect(u.state.phase).toBe('installing');
  });

  it('refuses a download that fails verification', async () => {
    const { bridge, calls } = fakeBridge({ check: available('1.2.0'), download: fail('verify') });
    const u = new UpdateController(bridge);
    await u.check();
    await u.download();
    expect(u.state).toMatchObject({ phase: 'error', step: 'download', reason: 'verify', version: '1.2.0' });
    await u.install();
    expect(calls).not.toContain('install');
    u.openReleasePage();
    expect(calls).toContain('releases');
  });

  it('reports interrupted downloads and failed installs, and can start over', async () => {
    let n = 0;
    const { bridge } = fakeBridge({ check: available('1.2.0'), download: () => (n++ ? Promise.resolve() : fail('offline')()), install: fail('failed: installer could not start') });
    const u = new UpdateController(bridge);
    await u.check();
    await u.download();
    expect(u.state).toMatchObject({ phase: 'error', step: 'download', reason: 'offline' });
    expect(u.newVersion).toBeNull();
    await u.check();
    await u.download();
    expect(u.state.phase).toBe('ready');
    await u.install();
    expect(u.state).toMatchObject({ phase: 'error', step: 'install', reason: 'failed' });
  });
});
