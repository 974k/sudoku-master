// Difficulty grading by logical complexity (not clue count alone).

import { countGivens } from './board.ts';
import {
  TECHNIQUE_BY_ID,
  applyStep,
  countAvailableSingles,
  createState,
  findNextStep,
  isComplete,
  type TechniqueId,
  type TechniqueTier,
} from './logic.ts';

export const LEVELS = ['beginner', 'easy', 'medium', 'hard', 'expert'] as const;
export type LevelId = (typeof LEVELS)[number];

/** Singles-only puzzles with at least this many givens count as Beginner. */
export const BEGINNER_MIN_GIVENS = 37;

export interface Grade {
  /** Solvable start-to-finish by the logical solver (no guessing). */
  solvable: boolean;
  level: LevelId | null;
  hardest: TechniqueId | null;
  tier: TechniqueTier | null;
  /** Continuous effort score used to order puzzles within a level. */
  score: number;
  givens: number;
  steps: number;
  counts: Partial<Record<TechniqueId, number>>;
}

const TIER_RANK: Record<TechniqueTier, number> = { singles: 0, medium: 1, hard: 2, expert: 3 };

export function levelForTier(tier: TechniqueTier, givens: number): LevelId {
  switch (tier) {
    case 'singles':
      return givens >= BEGINNER_MIN_GIVENS ? 'beginner' : 'easy';
    case 'medium':
      return 'medium';
    case 'hard':
      return 'hard';
    case 'expert':
      return 'expert';
  }
}

export function gradePuzzle(grid: ArrayLike<number>): Grade {
  const state = createState(grid);
  const givens = countGivens(grid);
  const counts: Partial<Record<TechniqueId, number>> = {};
  let hardest: TechniqueId | null = null;
  let score = 0;
  let steps = 0;

  while (!isComplete(state) && steps < 2000) {
    const avail = countAvailableSingles(state);
    const step = findNextStep(state);
    if (!step) break;
    const info = TECHNIQUE_BY_ID[step.technique];
    counts[step.technique] = (counts[step.technique] ?? 0) + 1;
    if (!hardest || info.weight > TECHNIQUE_BY_ID[hardest].weight) hardest = step.technique;
    // placements are harder to spot when few are available at once;
    // eliminations cost more because the player must find a whole pattern
    score += step.placement ? info.weight * (1 + 2 / Math.max(1, avail)) : info.weight * info.weight;
    applyStep(state, step);
    steps++;
  }

  const solvable = isComplete(state);
  const tier = hardest ? TECHNIQUE_BY_ID[hardest].tier : null;
  return {
    solvable,
    level: solvable && tier ? levelForTier(tier, givens) : null,
    hardest,
    tier,
    score: Math.round(score * 10) / 10,
    givens,
    steps,
    counts,
  };
}

/** A single number that orders puzzles from easiest to hardest. */
export function difficultyIndex(g: Grade): number {
  const hardestWeight = g.hardest ? TECHNIQUE_BY_ID[g.hardest].weight : 0;
  const tierRank = g.tier ? TIER_RANK[g.tier] : 0;
  return tierRank * 10000 + hardestWeight * 100 + g.score;
}
