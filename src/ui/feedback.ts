// Sound effects synthesized on the fly with Web Audio (no audio files) and
// optional vibration. Both respect the player's settings.

import type { Settings } from '../game/settings.ts';

type Sfx = 'tap' | 'place' | 'note' | 'mistake' | 'unit' | 'win' | 'hint' | 'unlock';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', volume = 0.06): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const SOUNDS: Record<Sfx, () => void> = {
  tap: () => tone(660, 0, 0.05, 'sine', 0.025),
  note: () => tone(990, 0, 0.05, 'sine', 0.02),
  place: () => tone(784, 0, 0.12, 'sine', 0.05),
  mistake: () => {
    tone(196, 0, 0.16, 'triangle', 0.07);
    tone(185, 0.12, 0.2, 'triangle', 0.06);
  },
  unit: () => [784, 988, 1175].forEach((f, i) => tone(f, i * 0.07, 0.18, 'sine', 0.045)),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.1, 0.35, 'sine', 0.05)),
  hint: () => [880, 1320].forEach((f, i) => tone(f, i * 0.08, 0.2, 'sine', 0.035)),
  unlock: () => [659, 880, 1109].forEach((f, i) => tone(f, i * 0.09, 0.25, 'triangle', 0.04)),
};

const VIBRATION: Partial<Record<Sfx, number | number[]>> = {
  mistake: [40, 60, 40],
  win: [30, 40, 30, 40, 60],
  unit: 15,
  place: 8,
};

export class Feedback {
  private settings: () => Settings;

  constructor(settings: () => Settings) {
    this.settings = settings;
  }

  play(sfx: Sfx): void {
    const s = this.settings();
    if (s.sound) {
      try {
        const a = audio();
        if (a?.state === 'suspended') void a.resume();
        SOUNDS[sfx]();
      } catch {
        /* audio is optional */
      }
    }
    const pattern = VIBRATION[sfx];
    if (s.vibration && pattern !== undefined && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern);
      } catch {
        /* vibration is optional */
      }
    }
  }
}
