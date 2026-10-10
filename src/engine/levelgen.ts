// On-device generation of a puzzle for a requested difficulty (Sudoku AI).
//
// Uses the same generator, uniqueness solver and logical grader that built the
// bundled puzzle bank. A candidate is only accepted when it has a consistent
// grid, exactly one solution, can be solved by logic alone, and its hardest
// required technique (plus clue count, for Beginner/Easy) puts it in the
// requested level. Anything else is rejected and the caller tries again.

import { isConsistent, type Grid } from './board.ts';
import { generatePuzzle } from './generator.ts';
import { BEGINNER_MIN_GIVENS, LEVELS, gradePuzzle, type Grade, type LevelId } from './grade.ts';
import type { Rng } from './rng.ts';
import { uniqueSolution } from './solver.ts';

export interface LevelPuzzle {
  puzzle: Grid;
  solution: Grid;
  grade: Grade;
}

/** Full validation of a puzzle for a level; null if it doesn't qualify. */
export function validateForLevel(puzzle: Grid, level: LevelId): LevelPuzzle | null {
  if (puzzle.length !== 81 || !isConsistent(puzzle)) return null;
  const solution = uniqueSolution(puzzle);
  if (!solution) return null;
  for (let i = 0; i < 81; i++) if (puzzle[i] && puzzle[i] !== solution[i]) return null;
  const grade = gradePuzzle(puzzle);
  if (!grade.solvable || grade.level !== level) return null;
  return { puzzle, solution, grade };
}

/** One generation attempt for `level`; null when the candidate is rejected. */
export function tryGenerateForLevel(level: LevelId, rng: Rng): LevelPuzzle | null {
  // Beginner and Easy differ by clue count, so dig to a target; harder levels
  // dig to a minimal puzzle and are sorted by the techniques they need.
  const target =
    level === 'beginner' ? BEGINNER_MIN_GIVENS + rng.int(10) : level === 'easy' ? (rng.next() < 0.6 ? 30 + rng.int(7) : 17) : 17;
  const { puzzle } = generatePuzzle({ rng, targetGivens: target });
  return validateForLevel(puzzle, level);
}

/** Keep trying until a puzzle qualifies (or the attempt budget runs out). */
export function generateForLevel(level: LevelId, rng: Rng, maxAttempts = 50_000): LevelPuzzle {
  for (let i = 0; i < maxAttempts; i++) {
    const found = tryGenerateForLevel(level, rng);
    if (found) return found;
  }
  throw new Error(`No ${level} puzzle found in ${maxAttempts} attempts`);
}

/** Every level has the same chance: used by the random-difficulty challenge. */
export function pickRandomLevel(rng: Rng): LevelId {
  return LEVELS[rng.int(LEVELS.length)]!;
}
