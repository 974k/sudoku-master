// Player preferences. Stored only on this device.

export type Theme = 'system' | 'light' | 'dark' | 'sepia';
export type TextSize = 'normal' | 'large' | 'xlarge';

export interface Settings {
  theme: Theme;
  sound: boolean;
  vibration: boolean;
  // gameplay assists
  highlightRegion: boolean;
  highlightSameNumbers: boolean;
  autoRemoveNotes: boolean;
  showRemaining: boolean;
  showTimer: boolean;
  // difficulty preferences
  mistakeLimit: 0 | 3 | 5;
  hints: boolean;
  learningMode: boolean;
  unlockAll: boolean;
  // accessibility
  textSize: TextSize;
  highContrast: boolean;
  reduceMotion: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  theme: 'system',
  sound: true,
  vibration: true,
  highlightRegion: true,
  highlightSameNumbers: true,
  autoRemoveNotes: true,
  showRemaining: true,
  showTimer: true,
  mistakeLimit: 0,
  hints: true,
  learningMode: false,
  unlockAll: false,
  textSize: 'normal',
  highContrast: false,
  reduceMotion: false,
};

const pick = <T extends string | number>(v: unknown, options: readonly T[], fallback: T): T =>
  options.includes(v as T) ? (v as T) : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** Coerce anything (e.g. stale or corrupted storage) into valid settings. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    theme: pick(r.theme, ['system', 'light', 'dark', 'sepia'] as const, d.theme),
    sound: bool(r.sound, d.sound),
    vibration: bool(r.vibration, d.vibration),
    highlightRegion: bool(r.highlightRegion, d.highlightRegion),
    highlightSameNumbers: bool(r.highlightSameNumbers, d.highlightSameNumbers),
    autoRemoveNotes: bool(r.autoRemoveNotes, d.autoRemoveNotes),
    showRemaining: bool(r.showRemaining, d.showRemaining),
    showTimer: bool(r.showTimer, d.showTimer),
    mistakeLimit: pick(r.mistakeLimit, [0, 3, 5] as const, d.mistakeLimit),
    hints: bool(r.hints, d.hints),
    learningMode: bool(r.learningMode, d.learningMode),
    unlockAll: bool(r.unlockAll, d.unlockAll),
    textSize: pick(r.textSize, ['normal', 'large', 'xlarge'] as const, d.textSize),
    highContrast: bool(r.highContrast, d.highContrast),
    reduceMotion: bool(r.reduceMotion, d.reduceMotion),
  };
}
