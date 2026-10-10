// Verifies every bundled puzzle: format, uniqueness, logic-solvability,
// difficulty bucket, progression, and no duplicates.

import { describe, expect, it } from 'vitest';
import { countGivens, gridToString, parseGrid } from '../engine/board.ts';
import { difficultyIndex, gradePuzzle } from '../engine/grade.ts';
import { solveLogically, TECHNIQUES } from '../engine/logic.ts';
import { hasUniqueSolution, uniqueSolution } from '../engine/solver.ts';
import { DAILY_POOLS, STAGE_PUZZLES, TECHNIQUE_EXAMPLES } from '../data/puzzles.ts';
import { DAILY_SCHEDULE, LEVELS, addDays, dailyLevel, dailyPuzzleRef, refFromId, stagePuzzleRef } from './catalog.ts';

const allStage = LEVELS.flatMap((l) => STAGE_PUZZLES[l].map((p) => ({ level: l, p })));
const allDaily = Object.entries(DAILY_POOLS).flatMap(([l, ps]) => ps.map((p) => ({ level: l, p })));

describe('puzzle bank', () => {
  it('has 5 levels × 10 stages × 10 puzzles', () => {
    expect(LEVELS).toHaveLength(5);
    for (const l of LEVELS) expect(STAGE_PUZZLES[l]).toHaveLength(100);
    expect(allStage).toHaveLength(500);
  });

  it('every puzzle is well-formed with exactly one solution', () => {
    for (const { p } of [...allStage, ...allDaily]) {
      expect(p).toMatch(/^[1-9.]{81}$/);
      expect(hasUniqueSolution(parseGrid(p))).toBe(true);
    }
  });

  it('every puzzle is solvable by logic alone and graded into its level', () => {
    for (const { level, p } of [...allStage, ...allDaily]) {
      const g = gradePuzzle(parseGrid(p));
      expect(g.solvable, p).toBe(true);
      expect(g.level, p).toBe(level);
    }
  });

  it('contains no duplicate puzzles or solution grids', () => {
    const all = [...allStage, ...allDaily].map((x) => x.p);
    expect(new Set(all).size).toBe(all.length);
    const sols = all.map((p) => gridToString(uniqueSolution(parseGrid(p))!));
    expect(new Set(sols).size).toBe(sols.length);
  });

  it('ramps difficulty up through the stages of each level', () => {
    for (const l of LEVELS) {
      const idx = STAGE_PUZZLES[l].map((p) => difficultyIndex(gradePuzzle(parseGrid(p))));
      for (let i = 1; i < idx.length; i++) expect(idx[i]!).toBeGreaterThanOrEqual(idx[i - 1]!);
      // stage averages strictly increase
      const avg = (s: number) => idx.slice(s * 10, s * 10 + 10).reduce((a, b) => a + b, 0) / 10;
      for (let s = 1; s < 10; s++) expect(avg(s)).toBeGreaterThan(avg(s - 1));
    }
  });

  it('gives Beginner the most clues and fewer as levels rise', () => {
    const avgGivens = (l: (typeof LEVELS)[number]) => STAGE_PUZZLES[l].reduce((a, p) => a + countGivens(parseGrid(p)), 0) / 100;
    expect(avgGivens('beginner')).toBeGreaterThan(avgGivens('easy'));
    expect(avgGivens('easy')).toBeGreaterThan(avgGivens('medium'));
    for (const p of STAGE_PUZZLES.beginner) expect(countGivens(parseGrid(p))).toBeGreaterThanOrEqual(37);
  });

  it('has a real example position for every technique', () => {
    for (const t of TECHNIQUES) {
      const ex = TECHNIQUE_EXAMPLES[t.id];
      expect(ex, t.id).toBeDefined();
      const { steps } = solveLogically(parseGrid(ex!.puzzle));
      expect(steps[ex!.step]?.technique, t.id).toBe(t.id);
    }
  });
});

describe('catalog', () => {
  it('looks up stage puzzles by id', () => {
    const ref = stagePuzzleRef('medium', 3, 7);
    expect(ref.id).toBe('medium-3-7');
    expect(refFromId('medium-3-7')?.givens).toBe(ref.givens);
    expect(refFromId('medium-11-1')).toBeNull();
    expect(refFromId('nope-1-1')).toBeNull();
    expect(refFromId('daily-2026-02-30')).toBeNull();
  });

  it('serves a unique, correctly graded daily puzzle for every day of a year', () => {
    const seen = new Set<string>();
    let day = '2026-01-01';
    for (let i = 0; i < 366; i++) {
      const ref = dailyPuzzleRef(day);
      expect(ref.id).toBe(`daily-${day}`);
      expect(ref.level).toBe(DAILY_SCHEDULE[new Date(day + 'T12:00').getDay()]);
      expect(seen.has(ref.givens)).toBe(false);
      seen.add(ref.givens);
      // spot-check uniqueness + grading on a sample of transformed puzzles
      if (i % 7 === 0) {
        expect(hasUniqueSolution(parseGrid(ref.givens))).toBe(true);
        expect(gradePuzzle(parseGrid(ref.givens)).level).toBe(ref.level);
      }
      // stable for the same date
      if (i === 0) expect(dailyPuzzleRef(day).givens).toBe(ref.givens);
      day = addDays(day, 1);
    }
    expect(dailyLevel('2026-10-11')).toBe('expert'); // a Sunday
  });

  it('daily puzzles never coincide with stage puzzles', () => {
    const stage = new Set(allStage.map((x) => x.p.replace(/\./g, '0')));
    let day = '2026-06-01';
    for (let i = 0; i < 60; i++, day = addDays(day, 1)) expect(stage.has(dailyPuzzleRef(day).givens)).toBe(false);
  });
});
