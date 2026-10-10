// Puzzle generator: build a random solved grid, then remove clues (in
// 180°-symmetric pairs) while the puzzle keeps exactly one solution.

import { countGivens, type Grid } from './board.ts';
import type { Rng } from './rng.ts';
import { hasUniqueSolution, randomSolvedGrid } from './solver.ts';

export interface GenerateOptions {
  rng: Rng;
  /** Stop removing clues once the puzzle has this many givens (default: dig to minimal). */
  targetGivens?: number;
  /** Remove clues in rotationally symmetric pairs (default true). */
  symmetric?: boolean;
}

export interface Generated {
  puzzle: Grid;
  solution: Grid;
}

export function generatePuzzle(opts: GenerateOptions): Generated {
  const { rng, targetGivens = 17, symmetric = true } = opts;
  const solution = randomSolvedGrid(rng);
  const puzzle = solution.slice();

  const groups: number[][] = [];
  if (symmetric) {
    for (let i = 0; i < 40; i++) groups.push([i, 80 - i]);
    groups.push([40]);
  } else {
    for (let i = 0; i < 81; i++) groups.push([i]);
  }
  rng.shuffle(groups);

  let givens = 81;
  for (const group of groups) {
    if (givens <= targetGivens) break;
    const saved = group.map((i) => puzzle[i]!);
    for (const i of group) puzzle[i] = 0;
    if (hasUniqueSolution(puzzle)) {
      givens -= group.length;
    } else {
      group.forEach((i, k) => (puzzle[i] = saved[k]!));
    }
  }
  if (countGivens(puzzle) !== givens) throw new Error('Given count drifted');
  return { puzzle, solution };
}
