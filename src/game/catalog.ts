// Levels, stages and puzzle lookup (stage puzzles and daily challenges).

import { gridToString, parseGrid } from '../engine/board.ts';
import { LEVELS, type LevelId } from '../engine/grade.ts';
import { createRng } from '../engine/rng.ts';
import { uniqueSolution } from '../engine/solver.ts';
import { applyTransform, randomTransform } from '../engine/transform.ts';
import { DAILY_POOLS, STAGE_PUZZLES } from '../data/puzzles.ts';

export { LEVELS, type LevelId };

export const STAGES_PER_LEVEL = 10;
export const PUZZLES_PER_STAGE = 10;
/** Puzzles to solve in a stage before the next stage unlocks. */
export const STAGE_UNLOCK_REQUIREMENT = 7;
/** Stages to clear in a level before the next level unlocks. */
export const LEVEL_UNLOCK_STAGES = 2;

export interface LevelInfo {
  id: LevelId;
  name: string;
  tagline: string;
  description: string;
}

export const LEVEL_INFO: Record<LevelId, LevelInfo> = {
  beginner: {
    id: 'beginner',
    name: 'Beginner',
    tagline: 'Learn the basics',
    description: 'Lots of clues. Every move can be found by scanning a single row, column or box.',
  },
  easy: {
    id: 'easy',
    name: 'Easy',
    tagline: 'Relaxed solving',
    description: 'Fewer clues. Solvable with singles alone, but you will need to look a little harder.',
  },
  medium: {
    id: 'medium',
    name: 'Medium',
    tagline: 'Think it through',
    description: 'Needs notes and techniques such as pointing pairs and naked pairs.',
  },
  hard: {
    id: 'hard',
    name: 'Hard',
    tagline: 'Advanced techniques',
    description: 'Calls for patterns like the Skyscraper, XY-Wing and W-Wing.',
  },
  expert: {
    id: 'expert',
    name: 'Expert',
    tagline: 'Master class',
    description: 'Requires chains, Swordfish or colouring. For seasoned solvers.',
  },
};

export type PuzzleKind = 'stage' | 'daily';

export interface PuzzleRef {
  id: string;
  kind: PuzzleKind;
  level: LevelId;
  /** 1-based stage and position, for stage puzzles. */
  stage?: number;
  number?: number;
  /** YYYY-MM-DD, for daily puzzles. */
  date?: string;
  givens: string;
}

export interface Puzzle extends PuzzleRef {
  solution: string;
}

export function stagePuzzleId(level: LevelId, stage: number, number: number): string {
  return `${level}-${stage}-${number}`;
}

export function isLevel(x: string): x is LevelId {
  return (LEVELS as readonly string[]).includes(x);
}

export function stagePuzzleRef(level: LevelId, stage: number, number: number): PuzzleRef {
  if (stage < 1 || stage > STAGES_PER_LEVEL || number < 1 || number > PUZZLES_PER_STAGE) {
    throw new Error(`No such puzzle: ${level} ${stage}-${number}`);
  }
  const givens = STAGE_PUZZLES[level][(stage - 1) * PUZZLES_PER_STAGE + (number - 1)]!;
  return { id: stagePuzzleId(level, stage, number), kind: 'stage', level, stage, number, givens: normalise(givens) };
}

function normalise(givens: string): string {
  return givens.replace(/\./g, '0');
}

// ---------------------------------------------------------------------------
// daily challenge

/** Difficulty by weekday, Sunday first. */
export const DAILY_SCHEDULE: readonly LevelId[] = ['expert', 'easy', 'easy', 'medium', 'medium', 'hard', 'hard'];

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return dateKey(d) === key ? d : null;
}

/** Whole days since 2024-01-01 (calendar days, immune to DST). */
export function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2024, 0, 1)) / 86_400_000);
}

export function addDays(key: string, n: number): string {
  const d = parseDateKey(key)!;
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

export function dailyLevel(key: string): LevelId {
  return DAILY_SCHEDULE[parseDateKey(key)!.getDay()]!;
}

export function dailyPuzzleRef(key: string): PuzzleRef {
  if (!parseDateKey(key)) throw new Error(`Bad date: ${key}`);
  const level = dailyLevel(key);
  const pool = DAILY_POOLS[level as keyof typeof DAILY_POOLS];
  const n = dayNumber(key);
  const base = pool[((n % pool.length) + pool.length) % pool.length]!;
  // A seeded symmetry transform makes each day's grid look new while keeping
  // its unique solution and logical difficulty.
  const t = randomTransform(createRng(`daily-${key}`));
  const givens = gridToString(applyTransform(parseGrid(base), t));
  return { id: `daily-${key}`, kind: 'daily', level, date: key, givens };
}

// ---------------------------------------------------------------------------

export function refFromId(id: string): PuzzleRef | null {
  try {
    const daily = /^daily-(\d{4}-\d{2}-\d{2})$/.exec(id);
    if (daily) return parseDateKey(daily[1]!) ? dailyPuzzleRef(daily[1]!) : null;
    const m = /^([a-z]+)-(\d+)-(\d+)$/.exec(id);
    if (!m || !isLevel(m[1]!)) return null;
    return stagePuzzleRef(m[1]!, Number(m[2]), Number(m[3]));
  } catch {
    return null;
  }
}

const solutionCache = new Map<string, string>();

export function solutionFor(givens: string): string {
  let sol = solutionCache.get(givens);
  if (!sol) {
    const g = uniqueSolution(parseGrid(givens));
    if (!g) throw new Error('Puzzle does not have a unique solution');
    sol = gridToString(g);
    solutionCache.set(givens, sol);
  }
  return sol;
}

export function loadPuzzle(ref: PuzzleRef): Puzzle {
  return { ...ref, solution: solutionFor(ref.givens) };
}

export function levelIndex(level: LevelId): number {
  return LEVELS.indexOf(level);
}
