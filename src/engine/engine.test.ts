import { describe, expect, it } from 'vitest';
import { countGivens, gridToString, isConsistent, isSolvedGrid, parseGrid, PEERS, UNITS } from './board.ts';
import { generatePuzzle } from './generator.ts';
import { gradePuzzle } from './grade.ts';
import { applyStep, createState, findNextStep, findWith, hasContradiction, isComplete, type TechniqueId } from './logic.ts';
import { createRng } from './rng.ts';
import { hasUniqueSolution, randomSolvedGrid, solve, uniqueSolution } from './solver.ts';
import { applyTransform, randomTransform } from './transform.ts';

const CLASSIC = '003020600900305001001806400008102900700000008006708200002609500800203009005010300';
const CLASSIC_SOLUTION = '483921657967345821251876493548132976729564138136798245372689514814253769695417382';
// Hard puzzles from the public domain used to exercise advanced techniques.
const HARD = [
  '000000010400000000020000000000050407008000300001090000300400200050100000000806000',
  '100007090030020008009600500005300900010080002600004000300000010040000007007000300',
  '000000039000001005003050800008090006070002000100400000009080050020000600400700000',
  '800000000003600000070090200050007000000045700000100030001000068008500010090000400',
];

/** Run the logical solver and assert every deduction agrees with the true solution. */
function assertSound(puzzle: string): { solved: boolean; used: Set<TechniqueId> } {
  const grid = parseGrid(puzzle);
  const solution = uniqueSolution(grid);
  expect(solution).not.toBeNull();
  const state = createState(grid);
  const used = new Set<TechniqueId>();
  for (let n = 0; n < 500 && !isComplete(state); n++) {
    const step = findNextStep(state);
    if (!step) break;
    used.add(step.technique);
    if (step.placement) {
      expect(solution![step.placement.cell], `${step.technique} placement`).toBe(step.placement.digit);
    }
    for (const e of step.eliminations) {
      expect(solution![e.cell], `${step.technique} eliminated the true digit`).not.toBe(e.digit);
    }
    expect(step.placement || step.eliminations.length).toBeTruthy();
    applyStep(state, step);
    expect(hasContradiction(state)).toBe(false);
  }
  if (isComplete(state)) expect(gridToString(state.values)).toBe(gridToString(solution!));
  return { solved: isComplete(state), used };
}

describe('board', () => {
  it('has 27 units of 9 and 20 peers per cell', () => {
    expect(UNITS).toHaveLength(27);
    for (const u of UNITS) expect(new Set(u).size).toBe(9);
    for (const p of PEERS) expect(p).toHaveLength(20);
  });

  it('parses and prints grids', () => {
    expect(gridToString(parseGrid(CLASSIC))).toBe(CLASSIC);
    expect(gridToString(parseGrid(CLASSIC.replace(/0/g, '.')))).toBe(CLASSIC);
    expect(() => parseGrid('123')).toThrow();
    expect(() => parseGrid('x'.repeat(81))).toThrow();
  });

  it('detects conflicts', () => {
    const g = parseGrid(CLASSIC);
    expect(isConsistent(g)).toBe(true);
    g[1] = 3; // duplicates the 3 in the same row
    expect(isConsistent(g)).toBe(false);
  });
});

describe('backtracking solver', () => {
  it('solves a classic puzzle uniquely', () => {
    const r = solve(parseGrid(CLASSIC));
    expect(r.count).toBe(1);
    expect(gridToString(r.solution!)).toBe(CLASSIC_SOLUTION);
  });

  it('reports multiple solutions and invalid grids', () => {
    expect(solve(new Uint8Array(81)).count).toBe(2);
    const bad = parseGrid(CLASSIC);
    bad[0] = 3;
    bad[1] = 3;
    expect(solve(bad).count).toBe(0);
    expect(hasUniqueSolution(parseGrid('0'.repeat(81)))).toBe(false);
  });

  it('builds valid, seed-deterministic solved grids', () => {
    const a = randomSolvedGrid(createRng(42));
    const b = randomSolvedGrid(createRng(42));
    const c = randomSolvedGrid(createRng(43));
    expect(isSolvedGrid(a)).toBe(true);
    expect(gridToString(a)).toBe(gridToString(b));
    expect(gridToString(a)).not.toBe(gridToString(c));
  });
});

describe('generator', () => {
  it('produces unique, symmetric puzzles consistent with their solution', () => {
    for (let seed = 0; seed < 15; seed++) {
      const { puzzle, solution } = generatePuzzle({ rng: createRng(`gen-${seed}`) });
      expect(hasUniqueSolution(puzzle)).toBe(true);
      expect(gridToString(uniqueSolution(puzzle)!)).toBe(gridToString(solution));
      for (let i = 0; i < 81; i++) {
        if (puzzle[i]) expect(puzzle[i]).toBe(solution[i]);
        expect(Boolean(puzzle[i])).toBe(Boolean(puzzle[80 - i]));
      }
    }
  });

  it('respects a target given count', () => {
    const { puzzle } = generatePuzzle({ rng: createRng('target'), targetGivens: 40 });
    expect(countGivens(puzzle)).toBeGreaterThanOrEqual(39);
    expect(countGivens(puzzle)).toBeLessThanOrEqual(40);
    expect(hasUniqueSolution(puzzle)).toBe(true);
  });
});

describe('logical solver', () => {
  it('solves the classic puzzle with singles only', () => {
    const { solved, used } = assertSound(CLASSIC);
    expect(solved).toBe(true);
    for (const t of used) expect(['fullHouse', 'hiddenSingleBox', 'nakedSingle', 'hiddenSingleLine']).toContain(t);
  });

  it('never makes an unsound deduction on hard puzzles', () => {
    for (const p of HARD) assertSound(p);
  });

  it('never makes an unsound deduction on 150 random minimal puzzles', () => {
    const used = new Set<TechniqueId>();
    for (let seed = 0; seed < 150; seed++) {
      const { puzzle } = generatePuzzle({ rng: createRng(`sound-${seed}`) });
      for (const t of assertSound(gridToString(puzzle)).used) used.add(t);
    }
    // sanity: the sample exercises well beyond singles
    expect(used.has('pointing')).toBe(true);
    expect(used.has('nakedPair')).toBe(true);
  }, 120_000);

  it('finds an X-Wing in a textbook position', () => {
    // Digit 1 in rows 1 and 5 restricted to columns 2 and 8 (all else filled around).
    const s = createState(new Uint8Array(81));
    const b = 1;
    for (let i = 0; i < 81; i++) s.cands[i] = 0x1ff;
    for (const r of [0, 4]) for (let c = 0; c < 9; c++) if (c !== 1 && c !== 7) s.cands[r * 9 + c]! &= ~b;
    const step = findWith(s, 'xWing');
    expect(step).not.toBeNull();
    expect(step!.digits).toEqual([1]);
    for (const e of step!.eliminations) expect([1, 7]).toContain(e.cell % 9);
    expect(step!.eliminations.some((e) => Math.floor(e.cell / 9) === 0 || Math.floor(e.cell / 9) === 4)).toBe(false);
  });
});

describe('grading', () => {
  it('grades the classic puzzle as singles-only', () => {
    const g = gradePuzzle(parseGrid(CLASSIC));
    expect(g.solvable).toBe(true);
    expect(g.tier).toBe('singles');
    expect(g.level).toBe('easy');
  });

  it('marks puzzles beyond the technique set as not solvable without guessing', () => {
    // Arto Inkala's puzzle needs chains beyond our technique set
    const g = gradePuzzle(parseGrid(HARD[3]!));
    expect(g.solvable).toBe(false);
    expect(g.level).toBeNull();
  });
});

describe('transforms', () => {
  it('preserve uniqueness and logical difficulty', () => {
    for (let seed = 0; seed < 10; seed++) {
      const { puzzle } = generatePuzzle({ rng: createRng(`t-${seed}`) });
      const t = applyTransform(puzzle, randomTransform(createRng(`tt-${seed}`)));
      expect(hasUniqueSolution(t)).toBe(true);
      expect(countGivens(t)).toBe(countGivens(puzzle));
      const a = gradePuzzle(puzzle);
      const b = gradePuzzle(t);
      expect(b.solvable).toBe(a.solvable);
      expect(b.tier).toBe(a.tier);
    }
  });
});
