import { describe, expect, it } from 'vitest';
import { BOX_OF, COL_OF, ROW_OF, bit, gridToString, isConsistent, parseGrid } from './board.ts';
import { LEVELS } from './grade.ts';
import { generateForLevel, pickRandomLevel, validateForLevel } from './levelgen.ts';
import { solveLogically } from './logic.ts';
import { createRng } from './rng.ts';
import { solve } from './solver.ts';
import { STAGE_PUZZLES } from '../data/puzzles.ts';

/** Independent check that no row, column or box repeats a digit. */
function noDuplicates(g: Uint8Array): boolean {
  const seen = new Map<string, number>();
  for (let i = 0; i < 81; i++) {
    const d = g[i]!;
    if (!d) continue;
    for (const k of [`r${ROW_OF[i]}`, `c${COL_OF[i]}`, `b${BOX_OF[i]}`]) {
      const m = seen.get(k) ?? 0;
      if (m & bit(d)) return false;
      seen.set(k, m | bit(d));
    }
  }
  return true;
}

describe('Sudoku AI generation', () => {
  for (const level of LEVELS) {
    it(`generates valid, uniquely solvable ${level} puzzles of the right difficulty`, () => {
      for (let n = 0; n < 4; n++) {
        const { puzzle, solution, grade } = generateForLevel(level, createRng(`ai-test-${level}-${n}`));
        expect(puzzle).toHaveLength(81);
        expect(isConsistent(puzzle)).toBe(true);
        expect(noDuplicates(puzzle)).toBe(true);
        expect(solve(puzzle, 2).count).toBe(1);
        for (let i = 0; i < 81; i++) if (puzzle[i]) expect(puzzle[i]).toBe(solution[i]);
        expect(noDuplicates(solution) && solution.every((d) => d >= 1 && d <= 9)).toBe(true);
        const logic = solveLogically(puzzle);
        expect(logic.solved).toBe(true);
        expect(gridToString(logic.state.values)).toBe(gridToString(solution));
        expect(grade.level).toBe(level);
      }
    }, 120_000);
  }

  it('rejects conflicting, ambiguous and mislabelled puzzles', () => {
    const good = parseGrid(STAGE_PUZZLES.beginner[0]!);
    expect(validateForLevel(good, 'beginner')).not.toBeNull();
    expect(validateForLevel(good, 'expert')).toBeNull(); // wrong difficulty
    const clash = good.slice();
    const empty = clash.findIndex((d) => d === 0);
    clash[empty] = clash[ROW_OF[empty]! * 9 + (empty % 9 === 0 ? 1 : 0)] || 1;
    if (isConsistent(clash)) clash[empty] = clash.find((d, i) => d !== 0 && ROW_OF[i] === ROW_OF[empty])!;
    expect(validateForLevel(clash, 'beginner')).toBeNull(); // conflicting clue
    expect(validateForLevel(new Uint8Array(81), 'beginner')).toBeNull(); // many solutions
  });

  it('gives every difficulty the same chance in a random challenge', () => {
    const rng = createRng('fairness');
    const counts = Object.fromEntries(LEVELS.map((l) => [l, 0])) as Record<string, number>;
    const N = 10_000;
    for (let i = 0; i < N; i++) counts[pickRandomLevel(rng)]!++;
    for (const l of LEVELS) {
      expect(counts[l]! / N).toBeGreaterThan(0.18);
      expect(counts[l]! / N).toBeLessThan(0.22);
    }
  });

  it('is fast enough to feel instant, even for Expert', () => {
    const t0 = performance.now();
    for (let n = 0; n < 5; n++) generateForLevel('expert', createRng(`speed-${n}`));
    expect((performance.now() - t0) / 5).toBeLessThan(2000);
  }, 60_000);
});
