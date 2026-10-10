import { describe, expect, it } from 'vitest';
import { bit, computeCandidates, digitsOf, parseGrid, UNITS } from '../engine/board.ts';
import { hasUniqueSolution } from '../engine/solver.ts';
import { ACHIEVEMENTS, evaluateAchievements } from './achievements.ts';
import { LEVELS, dailyPuzzleRef, loadPuzzle, stagePuzzleRef, type LevelId } from './catalog.ts';
import { Game } from './game.ts';
import {
  createProfile,
  currentStreak,
  isLevelUnlocked,
  isStageUnlocked,
  levelProgress,
  nextPuzzle,
  recordWin,
  sanitizeProfile,
  stageProgress,
  starsFor,
  totalStars,
  type Profile,
} from './profile.ts';
import { DEFAULT_SETTINGS, sanitizeSettings } from './settings.ts';
import { AppStore } from './store.ts';
import { Storage, memoryBackend } from './storage.ts';
import { LESSONS } from './tutorial.ts';

function win(p: Profile, level: LevelId, stage: number, n: number, opts: { mistakes?: number; hints?: number; ms?: number; today?: string } = {}) {
  return recordWin(p, {
    ref: stagePuzzleRef(level, stage, n),
    elapsedMs: opts.ms ?? 300_000,
    mistakes: opts.mistakes ?? 0,
    hints: opts.hints ?? 0,
    usedNotes: false,
    today: opts.today ?? '2026-10-09',
  });
}

describe('stars', () => {
  it('awards 3 for perfect, 2 for small slips, 1 otherwise', () => {
    expect(starsFor(0, 0)).toBe(3);
    expect(starsFor(1, 0)).toBe(2);
    expect(starsFor(2, 2)).toBe(2);
    expect(starsFor(3, 0)).toBe(1);
    expect(starsFor(0, 3)).toBe(1);
  });

  it('keeps the best stars and time across replays', () => {
    const p = createProfile();
    win(p, 'beginner', 1, 1, { mistakes: 4, ms: 500_000 });
    const o = win(p, 'beginner', 1, 1, { ms: 200_000 });
    expect(o.newBest).toBe(true);
    expect(o.previousBestMs).toBe(500_000);
    expect(p.records['beginner-1-1']).toMatchObject({ stars: 3, bestMs: 200_000, solves: 2, perfect: true });
    win(p, 'beginner', 1, 1, { mistakes: 5, ms: 900_000 });
    expect(p.records['beginner-1-1']).toMatchObject({ stars: 3, bestMs: 200_000, solves: 3 });
    expect(p.levels.beginner.won).toBe(3);
    expect(p.levels.beginner.bestMs).toBe(200_000);
  });
});

describe('unlocking', () => {
  it('starts with only Beginner stage 1 open', () => {
    const p = createProfile();
    expect(isLevelUnlocked(p, 'beginner')).toBe(true);
    expect(isLevelUnlocked(p, 'easy')).toBe(false);
    expect(isStageUnlocked(p, 'beginner', 1)).toBe(true);
    expect(isStageUnlocked(p, 'beginner', 2)).toBe(false);
  });

  it('opens the next stage after 7 of 10 puzzles', () => {
    const p = createProfile();
    for (let n = 1; n <= 6; n++) expect(win(p, 'beginner', 1, n).unlockedStage).toBeNull();
    expect(isStageUnlocked(p, 'beginner', 2)).toBe(false);
    expect(win(p, 'beginner', 1, 7).unlockedStage).toBe(2);
    expect(stageProgress(p, 'beginner', 1)).toMatchObject({ solved: 7, stars: 21, cleared: true, complete: false });
    for (let n = 8; n <= 9; n++) win(p, 'beginner', 1, n);
    expect(win(p, 'beginner', 1, 10).stageCompleted).toBe(true);
  });

  it('opens the next level after clearing 2 stages', () => {
    const p = createProfile();
    for (let n = 1; n <= 7; n++) win(p, 'beginner', 1, n);
    for (let n = 1; n <= 6; n++) win(p, 'beginner', 2, n);
    expect(isLevelUnlocked(p, 'easy')).toBe(false);
    expect(win(p, 'beginner', 2, 7).unlockedLevel).toBe('easy');
    expect(isStageUnlocked(p, 'easy', 1)).toBe(true);
    expect(isLevelUnlocked(p, 'medium')).toBe(false);
  });

  it('unlock-all opens everything', () => {
    const p = createProfile();
    for (const l of LEVELS) expect(isStageUnlocked(p, l, 10, true)).toBe(true);
  });

  it('completes a level and earns its badge', () => {
    const p = createProfile();
    let last;
    for (let s = 1; s <= 10; s++) for (let n = 1; n <= 10; n++) last = win(p, 'beginner', s, n);
    expect(last!.levelCompleted).toBe(true);
    expect(levelProgress(p, 'beginner')).toMatchObject({ solved: 100, stars: 300, complete: true, gold: true });
    const fresh = evaluateAchievements(p).map((a) => a.id);
    expect(fresh).toContain('badge-beginner');
    expect(fresh).toContain('solved-100');
    expect(fresh).toContain('stars-100');
    expect(totalStars(p)).toBe(300);
  });

  it('suggests the next unsolved puzzle', () => {
    const p = createProfile();
    win(p, 'beginner', 1, 1);
    expect(nextPuzzle(p, stagePuzzleRef('beginner', 1, 1))?.id).toBe('beginner-1-2');
    for (let n = 2; n <= 10; n++) win(p, 'beginner', 1, n);
    expect(nextPuzzle(p, stagePuzzleRef('beginner', 1, 10))?.id).toBe('beginner-2-1');
  });
});

describe('streaks', () => {
  it('counts consecutive days and resets after a gap', () => {
    const p = createProfile();
    win(p, 'beginner', 1, 1, { today: '2026-10-01' });
    win(p, 'beginner', 1, 2, { today: '2026-10-01' });
    win(p, 'beginner', 1, 3, { today: '2026-10-02' });
    win(p, 'beginner', 1, 4, { today: '2026-10-03' });
    expect(p.streak).toMatchObject({ current: 3, best: 3 });
    expect(currentStreak(p, '2026-10-04')).toBe(3);
    expect(currentStreak(p, '2026-10-05')).toBe(0);
    win(p, 'beginner', 1, 5, { today: '2026-10-06' });
    expect(p.streak).toMatchObject({ current: 1, best: 3 });
  });

  it('crosses month boundaries', () => {
    const p = createProfile();
    win(p, 'beginner', 1, 1, { today: '2026-02-28' });
    win(p, 'beginner', 1, 2, { today: '2026-03-01' });
    expect(p.streak.current).toBe(2);
  });
});

describe('achievements', () => {
  it('unlocks First Puzzle, Perfect Game and Expert Solver from wins', () => {
    const p = createProfile();
    const ref = stagePuzzleRef('expert', 1, 1);
    recordWin(p, { ref, elapsedMs: 120_000, mistakes: 0, hints: 0, usedNotes: true, today: '2026-10-09' }, true);
    const ids = evaluateAchievements(p, { ref, elapsedMs: 120_000, mistakes: 0, hints: 0, usedNotes: true }).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['first-puzzle', 'perfect-game', 'expert-solver', 'independent', 'lightning', 'quick-thinker', 'note-taker']));
    expect(evaluateAchievements(p)).toHaveLength(0); // never awarded twice
  });

  it('has unique ids', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
});

describe('sanitizing stored data', () => {
  it('repairs corrupted settings', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    const s = sanitizeSettings({ theme: 'neon', mistakeLimit: 7, sound: 'yes', hints: false });
    expect(s.theme).toBe('system');
    expect(s.mistakeLimit).toBe(0);
    expect(s.sound).toBe(true);
    expect(s.hints).toBe(false);
  });

  it('repairs a corrupted profile', () => {
    const p = sanitizeProfile({ records: { 'easy-1-1': { stars: 9, bestMs: -5 }, bad: null }, levels: { easy: { won: 'x' } }, streak: 4 });
    expect(p.records['easy-1-1']!.stars).toBe(3);
    expect(p.records['easy-1-1']!.bestMs).toBe(0);
    expect(p.records.bad).toBeUndefined();
    expect(p.levels.easy.won).toBe(0);
    expect(p.streak.current).toBe(0);
    expect(sanitizeProfile('garbage')).toMatchObject({ v: 1, records: {} });
  });
});

describe('store persistence', () => {
  const day = new Date(2026, 9, 9, 12);

  it('saves progress, settings and unfinished games across sessions', () => {
    const backend = memoryBackend();
    const a = new AppStore(new Storage(backend), () => day);
    a.updateSettings({ theme: 'dark', mistakeLimit: 3 });
    const ref = stagePuzzleRef('beginner', 1, 1);
    const g = a.openGame(ref);
    expect(g.mistakeLimit).toBe(3);
    const c = g.values.findIndex((v) => v === 0);
    g.toggleNote(c, 5);
    g.addTime(3000);
    a.saveGame(g);

    const b = new AppStore(new Storage(backend), () => day);
    expect(b.settings.theme).toBe('dark');
    expect(b.continueTarget()?.ref.id).toBe(ref.id);
    const resumed = b.openGame(ref);
    expect(resumed.notes[c]).toBe(bit(5));
    expect(resumed.elapsedMs).toBe(3000);

    for (let i = 0; i < 81; i++) if (!resumed.values[i]) resumed.setValue(i, resumed.solution[i]!);
    const report = b.gameWon(resumed);
    expect(report.outcome.stars).toBe(3);
    expect(report.achievements.map((x) => x.id)).toContain('first-puzzle');

    const c2 = new AppStore(new Storage(backend), () => day);
    expect(c2.profile.records[ref.id]?.stars).toBe(3);
    expect(c2.continueTarget()).toBeNull();
    expect(c2.profile.streak.last).toBe('2026-10-09');
  });

  it('does not save a puzzle that was only opened', () => {
    const backend = memoryBackend();
    const a = new AppStore(new Storage(backend), () => day);
    a.saveGame(a.openGame(stagePuzzleRef('easy', 1, 1)));
    expect(new AppStore(new Storage(backend)).continueTarget()).toBeNull();
  });

  it('records daily challenges', () => {
    const a = new AppStore(new Storage(memoryBackend()), () => day);
    const ref = dailyPuzzleRef('2026-10-09');
    const g = a.openGame(ref);
    a.gameStarted(ref);
    for (let i = 0; i < 81; i++) if (!g.values[i]) g.setValue(i, g.solution[i]!);
    a.gameWon(g);
    expect(a.profile.records['daily-2026-10-09']).toBeDefined();
    expect(a.profile.daily).toMatchObject({ started: 1, won: 1 });
    expect(a.profile.achievements['daily-1']).toBeTruthy();
  });

  it('reset deletes every stored key', () => {
    const backend = memoryBackend();
    backend.setItem('other-app', 'keep me');
    const a = new AppStore(new Storage(backend), () => day);
    a.updateSettings({ sound: false });
    a.completeTutorial();
    a.resetAll();
    for (let i = 0; i < backend.length; i++) expect(backend.key(i)!.startsWith('sudoku-master:')).toBe(false);
    expect(backend.getItem('other-app')).toBe('keep me');
    expect(a.profile.tutorialDone).toBe(false);
    expect(a.settings.sound).toBe(true);
  });

  it('survives corrupted JSON in storage', () => {
    const backend = memoryBackend();
    backend.setItem('sudoku-master:profile', '{not json');
    backend.setItem('sudoku-master:games', '[1,2');
    const a = new AppStore(new Storage(backend), () => day);
    expect(a.profile.records).toEqual({});
    expect(a.continueTarget()).toBeNull();
  });

  it('keeps working (in memory) when storage is unavailable', () => {
    const s = new Storage(null);
    expect(s.persistent).toBe(false);
    const a = new AppStore(s, () => day);
    a.updateSettings({ theme: 'sepia' });
    expect(a.settings.theme).toBe('sepia');
  });

  it('drops games that no longer match a puzzle', () => {
    const backend = memoryBackend();
    const a = new AppStore(new Storage(backend), () => day);
    const g = a.openGame(stagePuzzleRef('beginner', 1, 3));
    g.toggleNote(g.values.findIndex((v) => v === 0), 1);
    a.saveGame(g);
    const raw = JSON.parse(backend.getItem('sudoku-master:games')!);
    raw.games['beginner-1-3'].givens = '1'.repeat(81);
    backend.setItem('sudoku-master:games', JSON.stringify(raw));
    expect(new AppStore(new Storage(backend)).continueTarget()).toBeNull();
  });

  it('a lost game can be resumed', () => {
    const a = new AppStore(new Storage(memoryBackend()), () => day);
    a.updateSettings({ mistakeLimit: 3 });
    const g = Game.create(loadPuzzle(stagePuzzleRef('beginner', 1, 4)), { mistakeLimit: 3 });
    const c = g.values.findIndex((v) => v === 0);
    const wrongs = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => d !== g.solution[c]);
    for (const w of wrongs.slice(0, 3)) g.setValue(c, w);
    expect(g.status).toBe('lost');
    a.saveGame(g);
    expect(a.openGame(stagePuzzleRef('beginner', 1, 4)).status).toBe('lost');
  });
});

describe('tutorial lessons', () => {
  it('each lesson board has a unique solution matching the lesson', () => {
    for (const l of LESSONS) {
      expect(hasUniqueSolution(parseGrid(l.givens)), l.id).toBe(true);
      for (let i = 0; i < 81; i++) if (l.givens[i] !== '0') expect(l.givens[i]).toBe(l.solution[i]);
    }
  });

  it('every task is deducible exactly as the lesson teaches', () => {
    for (const l of LESSONS) {
      const values = parseGrid(l.givens);
      for (const t of l.tasks) {
        if (t.kind === 'read') continue;
        expect(values[t.cell], `${l.id}: target is empty`).toBe(0);
        const cands = computeCandidates(values);
        if (t.kind === 'notes') {
          expect(digitsOf(cands[t.cell]!)).toEqual(t.digits);
          continue;
        }
        expect(String(t.digit)).toBe(l.solution[t.cell]);
        if (l.id === 'rules') {
          const unit = t.highlight!.units![0]!;
          expect(UNITS[unit]!.filter((i) => !values[i])).toEqual([t.cell]);
        } else if (l.id === 'naked-single') {
          expect(cands[t.cell]).toBe(bit(t.digit));
          for (const u of t.highlight!.units!) expect(UNITS[u]!.filter((i) => !values[i]).length).toBeGreaterThanOrEqual(2);
        } else if (l.id === 'hidden-single') {
          expect(digitsOf(cands[t.cell]!).length).toBeGreaterThan(1);
          const box = t.highlight!.units![0]!;
          expect(UNITS[box]!.filter((i) => !values[i] && cands[i]! & bit(t.digit))).toEqual([t.cell]);
          for (const c of t.highlight!.cells!) expect(values[c]).toBe(t.digit);
        }
        values[t.cell] = t.digit;
      }
    }
  });
});
