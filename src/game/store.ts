// Application state: settings, profile and saved games, persisted locally.

import { evaluateAchievements, type Achievement } from './achievements.ts';
import { dateKey, loadPuzzle, refFromId, type PuzzleRef } from './catalog.ts';
import { Game, type GameSnapshot } from './game.ts';
import { createProfile, recordStart, recordWin, sanitizeProfile, type Profile, type WinOutcome } from './profile.ts';
import { sanitizeSettings, type Settings } from './settings.ts';
import { Storage } from './storage.ts';

const MAX_SAVED_GAMES = 20;

export interface WinReport {
  outcome: WinOutcome;
  achievements: Achievement[];
}

export class AppStore {
  readonly storage: Storage;
  settings: Settings;
  profile: Profile;
  games: Record<string, GameSnapshot>;
  lastGameId: string | null;
  private listeners = new Set<() => void>();
  private clock: () => Date;

  constructor(storage = new Storage(), clock: () => Date = () => new Date()) {
    this.storage = storage;
    this.clock = clock;
    this.settings = sanitizeSettings(storage.read('settings', null));
    this.profile = sanitizeProfile(storage.read('profile', null));
    const saved = storage.read<{ games?: Record<string, GameSnapshot>; last?: string | null }>('games', {});
    this.games = saved && typeof saved.games === 'object' && saved.games ? saved.games : {};
    this.lastGameId = typeof saved?.last === 'string' ? saved.last : null;
    // retroactively grant anything earned (e.g. after an update adds achievements)
    if (evaluateAchievements(this.profile).length) this.saveProfile();
  }

  today(): string {
    return dateKey(this.clock());
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  // -------------------------------------------------------------------------
  // persistence

  saveSettings(): void {
    this.storage.write('settings', this.settings);
  }

  saveProfile(): void {
    this.storage.write('profile', this.profile);
  }

  private saveGames(): void {
    const ok = this.storage.write('games', { games: this.games, last: this.lastGameId });
    if (!ok) {
      // storage full: keep only the most recent games and retry once
      const keep = Object.values(this.games)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 3);
      this.games = Object.fromEntries(keep.map((g) => [g.id, { ...g, history: g.history.slice(-30), future: [] }]));
      this.storage.write('games', { games: this.games, last: this.lastGameId });
    }
  }

  updateSettings(patch: Partial<Settings>): void {
    this.settings = sanitizeSettings({ ...this.settings, ...patch });
    this.saveSettings();
    this.emit();
  }

  // -------------------------------------------------------------------------
  // games

  /** Resume a saved game for this puzzle, or start a fresh one. */
  openGame(ref: PuzzleRef): Game {
    const puzzle = loadPuzzle(ref);
    const snap = this.games[ref.id];
    if (snap) {
      const restored = Game.restore(puzzle, snap);
      if (restored && restored.status !== 'won') return restored;
      delete this.games[ref.id];
    }
    return Game.create(puzzle, { mistakeLimit: this.settings.mistakeLimit });
  }

  hasSavedGame(id: string): boolean {
    const g = this.games[id];
    return !!g && g.status !== 'won' && g.started;
  }

  saveGame(game: Game): void {
    if (game.status === 'won' || !game.started) {
      if (this.games[game.puzzle.id]) {
        delete this.games[game.puzzle.id];
        this.saveGames();
      }
      return;
    }
    this.games[game.puzzle.id] = game.snapshot();
    this.lastGameId = game.puzzle.id;
    const ids = Object.keys(this.games);
    if (ids.length > MAX_SAVED_GAMES) {
      ids
        .sort((a, b) => this.games[a]!.updatedAt - this.games[b]!.updatedAt)
        .slice(0, ids.length - MAX_SAVED_GAMES)
        .forEach((id) => delete this.games[id]);
    }
    this.saveGames();
  }

  discardGame(id: string): void {
    delete this.games[id];
    if (this.lastGameId === id) this.lastGameId = null;
    this.saveGames();
    this.emit();
  }

  /** The game the Continue button should resume. */
  continueTarget(): { ref: PuzzleRef; snapshot: GameSnapshot } | null {
    const candidates = Object.values(this.games)
      .filter((g) => g.status !== 'won' && g.started)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const last = this.lastGameId ? this.games[this.lastGameId] : undefined;
    const pick = last && last.status !== 'won' && last.started ? last : candidates[0];
    if (!pick) return null;
    const ref = refFromId(pick.id);
    if (!ref || ref.givens !== pick.givens) return null;
    return { ref, snapshot: pick };
  }

  // -------------------------------------------------------------------------
  // events from gameplay

  gameStarted(ref: PuzzleRef): void {
    recordStart(this.profile, ref);
    this.saveProfile();
  }

  entryMade(correct: boolean): void {
    if (correct) this.profile.correct++;
    else this.profile.wrong++;
    this.saveProfile();
  }

  hintUsed(): void {
    this.profile.hints++;
    this.saveProfile();
  }

  gameWon(game: Game): WinReport {
    const ref = refFromId(game.puzzle.id)!;
    const ctx = {
      ref,
      elapsedMs: Math.round(game.elapsedMs),
      mistakes: game.mistakes,
      hints: game.hintsUsed,
      usedNotes: game.usedNotes,
    };
    const outcome = recordWin(this.profile, { ...ctx, today: this.today() }, this.settings.unlockAll);
    const achievements = evaluateAchievements(this.profile, ctx);
    this.saveProfile();
    delete this.games[game.puzzle.id];
    this.saveGames();
    this.emit();
    return { outcome, achievements };
  }

  completeTutorial(): Achievement[] {
    this.profile.tutorialDone = true;
    const fresh = evaluateAchievements(this.profile);
    this.saveProfile();
    this.emit();
    return fresh;
  }

  /** Erase every bit of locally stored data and start over. */
  resetAll(): void {
    this.storage.clearAll();
    this.settings = sanitizeSettings(null);
    this.profile = createProfile();
    this.games = {};
    this.lastGameId = null;
    this.emit();
  }
}
