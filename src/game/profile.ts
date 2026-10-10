// Player progress and statistics (stored only on this device).

import {
  LEVEL_UNLOCK_STAGES,
  LEVELS,
  PUZZLES_PER_STAGE,
  STAGE_CLEAR_REQUIREMENT,
  STAGES_PER_LEVEL,
  addDays,
  stagePuzzleId,
  stagePuzzleRef,
  type LevelId,
  type PuzzleRef,
} from './catalog.ts';

export type Stars = 1 | 2 | 3;

export interface PuzzleRecord {
  stars: Stars;
  bestMs: number;
  solves: number;
  perfect: boolean;
  /** Date (YYYY-MM-DD) of the first solve. */
  first: string;
}

export interface LevelStats {
  started: number;
  won: number;
  totalMs: number;
  bestMs: number | null;
  perfect: number;
}

export interface Profile {
  v: 1;
  records: Record<string, PuzzleRecord>;
  levels: Record<LevelId, LevelStats>;
  daily: LevelStats;
  correct: number;
  wrong: number;
  hints: number;
  perfectRun: number;
  bestPerfectRun: number;
  streak: { current: number; best: number; last: string | null };
  achievements: Record<string, number>;
  tutorialDone: boolean;
  createdAt: number;
}

const emptyLevelStats = (): LevelStats => ({ started: 0, won: 0, totalMs: 0, bestMs: null, perfect: 0 });

export function createProfile(): Profile {
  return {
    v: 1,
    records: {},
    levels: Object.fromEntries(LEVELS.map((l) => [l, emptyLevelStats()])) as Record<LevelId, LevelStats>,
    daily: emptyLevelStats(),
    correct: 0,
    wrong: 0,
    hints: 0,
    perfectRun: 0,
    bestPerfectRun: 0,
    streak: { current: 0, best: 0, last: null },
    achievements: {},
    tutorialDone: false,
    createdAt: Date.now(),
  };
}

const n = (x: unknown): number => {
  const v = Number(x);
  return Number.isFinite(v) && v >= 0 ? v : 0;
};

function sanitizeLevelStats(raw: unknown): LevelStats {
  const r = (raw ?? {}) as Partial<LevelStats>;
  const best = r.bestMs === null || r.bestMs === undefined ? null : n(r.bestMs) || null;
  return { started: n(r.started), won: n(r.won), totalMs: n(r.totalMs), bestMs: best, perfect: n(r.perfect) };
}

/** Coerce stored data into a valid profile, keeping whatever is usable. */
export function sanitizeProfile(raw: unknown): Profile {
  const p = createProfile();
  if (!raw || typeof raw !== 'object') return p;
  const r = raw as Partial<Profile>;
  if (r.records && typeof r.records === 'object') {
    for (const [id, rec] of Object.entries(r.records)) {
      if (!rec || typeof rec !== 'object') continue;
      const stars = Math.min(3, Math.max(1, Math.round(n(rec.stars)))) as Stars;
      p.records[id] = {
        stars,
        bestMs: n(rec.bestMs),
        solves: Math.max(1, n(rec.solves)),
        perfect: Boolean(rec.perfect),
        first: typeof rec.first === 'string' ? rec.first : '',
      };
    }
  }
  for (const l of LEVELS) p.levels[l] = sanitizeLevelStats(r.levels?.[l]);
  p.daily = sanitizeLevelStats(r.daily);
  p.correct = n(r.correct);
  p.wrong = n(r.wrong);
  p.hints = n(r.hints);
  p.perfectRun = n(r.perfectRun);
  p.bestPerfectRun = n(r.bestPerfectRun);
  if (r.streak && typeof r.streak === 'object') {
    p.streak = {
      current: n(r.streak.current),
      best: n(r.streak.best),
      last: typeof r.streak.last === 'string' ? r.streak.last : null,
    };
  }
  if (r.achievements && typeof r.achievements === 'object') {
    for (const [id, t] of Object.entries(r.achievements)) p.achievements[id] = n(t) || Date.now();
  }
  p.tutorialDone = Boolean(r.tutorialDone);
  p.createdAt = n(r.createdAt) || Date.now();
  return p;
}

// ---------------------------------------------------------------------------
// stars & records

export function starsFor(mistakes: number, hints: number): Stars {
  if (mistakes === 0 && hints === 0) return 3;
  if (mistakes <= 2 && hints <= 2) return 2;
  return 1;
}

export interface WinInput {
  ref: PuzzleRef;
  elapsedMs: number;
  mistakes: number;
  hints: number;
  usedNotes: boolean;
  today: string;
}

export interface WinOutcome {
  stars: Stars;
  perfect: boolean;
  firstSolve: boolean;
  previousBestMs: number | null;
  newBest: boolean;
  previousStars: Stars | null;
  stageCompleted: boolean;
  levelCompleted: boolean;
  unlockedStage: number | null;
  unlockedLevel: LevelId | null;
}

/** Apply a won game to the profile (mutates it) and describe what changed. */
export function recordWin(p: Profile, w: WinInput, unlockAll = false): WinOutcome {
  const { ref } = w;
  const perfect = w.mistakes === 0 && w.hints === 0;
  const stars = starsFor(w.mistakes, w.hints);
  // Generated (Sudoku AI) puzzles count towards stats but keep no per-puzzle
  // record: records drive stage progress, and there are endless generated puzzles.
  const prev = ref.kind === 'ai' ? undefined : p.records[ref.id];

  const before = ref.kind === 'stage' ? snapshotUnlocks(p, unlockAll) : null;
  const stageBefore = ref.kind === 'stage' ? stageProgress(p, ref.level, ref.stage!, unlockAll) : null;
  const levelBefore = ref.kind === 'stage' ? levelProgress(p, ref.level, unlockAll) : null;

  if (ref.kind !== 'ai') {
    p.records[ref.id] = {
      stars: (prev ? Math.max(prev.stars, stars) : stars) as Stars,
      bestMs: prev && prev.bestMs > 0 ? Math.min(prev.bestMs, w.elapsedMs) : w.elapsedMs,
      solves: (prev?.solves ?? 0) + 1,
      perfect: (prev?.perfect ?? false) || perfect,
      first: prev?.first || w.today,
    };
  }

  const ls = ref.kind === 'daily' ? p.daily : p.levels[ref.level];
  const lvl = p.levels[ref.level];
  for (const s of ref.kind === 'daily' ? [ls, lvl] : [ls]) {
    s.won++;
    s.totalMs += w.elapsedMs;
    s.bestMs = s.bestMs === null ? w.elapsedMs : Math.min(s.bestMs, w.elapsedMs);
    if (perfect) s.perfect++;
  }

  p.perfectRun = perfect ? p.perfectRun + 1 : 0;
  p.bestPerfectRun = Math.max(p.bestPerfectRun, p.perfectRun);
  touchStreak(p, w.today);

  let unlockedStage: number | null = null;
  let unlockedLevel: LevelId | null = null;
  let stageCompleted = false;
  let levelCompleted = false;
  if (before && ref.kind === 'stage') {
    const after = snapshotUnlocks(p, unlockAll);
    for (const key of after) {
      if (before.has(key)) continue;
      const [level, stage] = key.split(':') as [LevelId, string];
      if (stage === '*') unlockedLevel = level;
      else if (level === ref.level) unlockedStage = Number(stage);
    }
    stageCompleted = !stageBefore!.complete && stageProgress(p, ref.level, ref.stage!, unlockAll).complete;
    levelCompleted = !levelBefore!.complete && levelProgress(p, ref.level, unlockAll).complete;
  }

  return {
    stars,
    perfect,
    firstSolve: !prev,
    previousBestMs: prev?.bestMs ?? null,
    newBest: !!prev && w.elapsedMs < prev.bestMs,
    previousStars: prev?.stars ?? null,
    stageCompleted,
    levelCompleted,
    unlockedStage,
    unlockedLevel,
  };
}

export function recordStart(p: Profile, ref: PuzzleRef): void {
  p.levels[ref.level].started++;
  if (ref.kind === 'daily') p.daily.started++;
}

function touchStreak(p: Profile, today: string): void {
  const s = p.streak;
  if (s.last === today) return;
  s.current = s.last === addDays(today, -1) ? s.current + 1 : 1;
  s.last = today;
  s.best = Math.max(s.best, s.current);
}

/** The streak as it stands today (0 if the player missed yesterday). */
export function currentStreak(p: Profile, today: string): number {
  const { last, current } = p.streak;
  if (!last) return 0;
  return last === today || last === addDays(today, -1) ? current : 0;
}

// ---------------------------------------------------------------------------
// progression

export interface StageProgress {
  level: LevelId;
  stage: number;
  solved: number;
  stars: number;
  unlocked: boolean;
  /** Enough puzzles solved to count towards unlocking the next difficulty level. */
  cleared: boolean;
  /** All puzzles solved. */
  complete: boolean;
}

export function stageProgress(p: Profile, level: LevelId, stage: number, unlockAll = false): StageProgress {
  let solved = 0;
  let stars = 0;
  for (let k = 1; k <= PUZZLES_PER_STAGE; k++) {
    const r = p.records[stagePuzzleId(level, stage, k)];
    if (r) {
      solved++;
      stars += r.stars;
    }
  }
  return {
    level,
    stage,
    solved,
    stars,
    unlocked: isStageUnlocked(p, level, stage, unlockAll),
    cleared: solved >= STAGE_CLEAR_REQUIREMENT,
    complete: solved === PUZZLES_PER_STAGE,
  };
}

function stageSolved(p: Profile, level: LevelId, stage: number): number {
  let solved = 0;
  for (let k = 1; k <= PUZZLES_PER_STAGE; k++) if (p.records[stagePuzzleId(level, stage, k)]) solved++;
  return solved;
}

export function isLevelUnlocked(p: Profile, level: LevelId, unlockAll = false): boolean {
  const i = LEVELS.indexOf(level);
  if (i <= 0 || unlockAll) return true;
  const prev = LEVELS[i - 1]!;
  if (!isLevelUnlocked(p, prev, false)) return false;
  let cleared = 0;
  for (let s = 1; s <= STAGES_PER_LEVEL; s++) if (stageSolved(p, prev, s) >= STAGE_CLEAR_REQUIREMENT) cleared++;
  return cleared >= LEVEL_UNLOCK_STAGES;
}

/**
 * Strict progression: a stage opens once the previous stage is complete.
 * A stage the player has already solved puzzles in stays open (progress made
 * under earlier rules is never locked away).
 */
export function isStageUnlocked(p: Profile, level: LevelId, stage: number, unlockAll = false): boolean {
  if (unlockAll) return true;
  if (!isLevelUnlocked(p, level)) return false;
  if (stage <= 1) return true;
  return stageSolved(p, level, stage - 1) === PUZZLES_PER_STAGE || stageSolved(p, level, stage) > 0;
}

/**
 * Inside an open stage, puzzles open one at a time: the first, then each one
 * after the previous puzzle is solved. Solved puzzles always stay open.
 */
export function isPuzzleUnlocked(p: Profile, level: LevelId, stage: number, number: number, unlockAll = false): boolean {
  if (unlockAll) return true;
  if (!isStageUnlocked(p, level, stage)) return false;
  if (number <= 1) return true;
  return Boolean(p.records[stagePuzzleId(level, stage, number - 1)] || p.records[stagePuzzleId(level, stage, number)]);
}

export interface LevelProgress {
  level: LevelId;
  solved: number;
  stars: number;
  stagesCleared: number;
  stagesComplete: number;
  unlocked: boolean;
  complete: boolean;
  /** Every puzzle solved with three stars. */
  gold: boolean;
}

export function levelProgress(p: Profile, level: LevelId, unlockAll = false): LevelProgress {
  let solved = 0;
  let stars = 0;
  let stagesCleared = 0;
  let stagesComplete = 0;
  for (let s = 1; s <= STAGES_PER_LEVEL; s++) {
    const sp = stageProgress(p, level, s, unlockAll);
    solved += sp.solved;
    stars += sp.stars;
    if (sp.cleared) stagesCleared++;
    if (sp.complete) stagesComplete++;
  }
  const total = STAGES_PER_LEVEL * PUZZLES_PER_STAGE;
  return {
    level,
    solved,
    stars,
    stagesCleared,
    stagesComplete,
    unlocked: isLevelUnlocked(p, level, unlockAll),
    complete: solved === total,
    gold: stars === total * 3,
  };
}

function snapshotUnlocks(p: Profile, unlockAll: boolean): Set<string> {
  const out = new Set<string>();
  for (const l of LEVELS) {
    if (!isLevelUnlocked(p, l, unlockAll)) continue;
    out.add(`${l}:*`);
    for (let s = 1; s <= STAGES_PER_LEVEL; s++) if (isStageUnlocked(p, l, s, unlockAll)) out.add(`${l}:${s}`);
  }
  return out;
}

/** The puzzle to offer after finishing `ref`: next unsolved in the stage, then onwards. */
export function nextPuzzle(p: Profile, ref: PuzzleRef, unlockAll = false): PuzzleRef | null {
  if (ref.kind !== 'stage') return null;
  const startLevel = LEVELS.indexOf(ref.level);
  for (let li = startLevel; li < LEVELS.length; li++) {
    const level = LEVELS[li]!;
    if (!isLevelUnlocked(p, level, unlockAll)) return null;
    const firstStage = li === startLevel ? ref.stage! : 1;
    for (let s = firstStage; s <= STAGES_PER_LEVEL; s++) {
      if (!isStageUnlocked(p, level, s, unlockAll)) break;
      for (let k = 1; k <= PUZZLES_PER_STAGE; k++) {
        const id = stagePuzzleId(level, s, k);
        if (id !== ref.id && !p.records[id]) return stagePuzzleRef(level, s, k);
      }
    }
  }
  // everything unlocked is solved: offer the next puzzle in order for replay
  if (ref.number! < PUZZLES_PER_STAGE) return stagePuzzleRef(ref.level, ref.stage!, ref.number! + 1);
  return null;
}

export function totalStars(p: Profile): number {
  let s = 0;
  for (const [id, r] of Object.entries(p.records)) if (!id.startsWith('daily-')) s += r.stars;
  return s;
}

export function stagePuzzlesSolved(p: Profile): number {
  let c = 0;
  for (const id of Object.keys(p.records)) if (!id.startsWith('daily-')) c++;
  return c;
}

export function dailySolved(p: Profile): number {
  let c = 0;
  for (const id of Object.keys(p.records)) if (id.startsWith('daily-')) c++;
  return c;
}

export function gamesWon(p: Profile): number {
  return LEVELS.reduce((sum, l) => sum + p.levels[l].won, 0);
}

export function gamesStarted(p: Profile): number {
  return LEVELS.reduce((sum, l) => sum + p.levels[l].started, 0);
}

export function accuracy(p: Profile): number | null {
  const total = p.correct + p.wrong;
  return total ? p.correct / total : null;
}
