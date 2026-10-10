// Local-only persistence. Everything lives in this browser's localStorage
// under the "sudoku-master:" prefix. Nothing is ever sent anywhere.
//
// Storage can be unavailable (private browsing, blocked site data) or full;
// every access is guarded and the game keeps working in memory.

export const STORAGE_PREFIX = 'sudoku-master:';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

class MemoryStore implements KeyValueStore {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  get length() {
    return this.map.size;
  }
}

export class Storage {
  private backend: KeyValueStore;
  /** False when we fell back to memory (data won't survive a reload). */
  readonly persistent: boolean;
  lastError: string | null = null;

  constructor(backend?: KeyValueStore | null) {
    let store = backend ?? null;
    if (store === null && backend === undefined) {
      try {
        store = globalThis.localStorage ?? null;
        const probe = `${STORAGE_PREFIX}probe`;
        store?.setItem(probe, '1');
        store?.removeItem(probe);
      } catch {
        store = null;
      }
    }
    this.persistent = store !== null;
    this.backend = store ?? new MemoryStore();
  }

  read<T>(name: string, fallback: T): T {
    try {
      const raw = this.backend.getItem(STORAGE_PREFIX + name);
      if (raw === null) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  write(name: string, value: unknown): boolean {
    try {
      this.backend.setItem(STORAGE_PREFIX + name, JSON.stringify(value));
      this.lastError = null;
      return true;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  remove(name: string): void {
    try {
      this.backend.removeItem(STORAGE_PREFIX + name);
    } catch {
      /* ignore */
    }
  }

  /** Delete every key this game has ever written. */
  clearAll(): void {
    try {
      const keys: string[] = [];
      for (let i = 0; i < this.backend.length; i++) {
        const k = this.backend.key(i);
        if (k?.startsWith(STORAGE_PREFIX)) keys.push(k);
      }
      for (const k of keys) this.backend.removeItem(k);
    } catch {
      /* ignore */
    }
  }

  /** Approximate bytes used by this game's keys. */
  usage(): number {
    let n = 0;
    try {
      for (let i = 0; i < this.backend.length; i++) {
        const k = this.backend.key(i);
        if (k?.startsWith(STORAGE_PREFIX)) n += k.length + (this.backend.getItem(k)?.length ?? 0);
      }
    } catch {
      /* ignore */
    }
    return n * 2;
  }
}

export function memoryBackend(): KeyValueStore {
  return new MemoryStore();
}
