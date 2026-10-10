// Builds the bundled puzzle bank: src/data/puzzles.ts
//
//   npm run generate:puzzles
//
// Every puzzle is produced by our own generator, proven to have exactly one
// solution by the backtracking solver, and graded by the logical solver, which
// must solve it completely without guessing. Puzzles are bucketed into levels
// by the hardest technique they need and ordered by effort, so stages ramp up
// smoothly. The output is deterministic for a given SEED.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gridToString, parseGrid, type Grid } from '../src/engine/board.ts';
import { generatePuzzle } from '../src/engine/generator.ts';
import { BEGINNER_MIN_GIVENS, difficultyIndex, gradePuzzle, LEVELS, type Grade, type LevelId } from '../src/engine/grade.ts';
import { solveLogically, TECHNIQUES, type TechniqueId } from '../src/engine/logic.ts';
import { createRng } from '../src/engine/rng.ts';
import { hasUniqueSolution } from '../src/engine/solver.ts';

const SEED = 'sudoku-master-bank-v1';
const PER_LEVEL = 100;
const DAILY_SIZES = { easy: 52, medium: 52, hard: 52, expert: 30 } as const;
type DailyLevel = keyof typeof DAILY_SIZES;
/** Candidate pool per level; the bank is sampled evenly across it for a smooth ramp. */
const POOL: Record<LevelId, number> = { beginner: 300, easy: 360, medium: 320, hard: 320, expert: 220 };

interface Candidate {
  puzzle: string;
  solution: string;
  grade: Grade;
  index: number;
}

const rng = createRng(SEED);
const seenPuzzles = new Set<string>();
const seenSolutions = new Set<string>();
const pools: Record<LevelId, Candidate[]> = { beginner: [], easy: [], medium: [], hard: [], expert: [] };
const examples: Partial<Record<TechniqueId, { puzzle: string; step: number; level: LevelId }>> = {};

function consider(puzzle: Grid, solution: Grid, want: (level: LevelId) => boolean): void {
  const p = gridToString(puzzle).replace(/0/g, '.');
  const sol = gridToString(solution);
  if (seenPuzzles.has(p) || seenSolutions.has(sol)) return;
  const grade = gradePuzzle(puzzle);
  if (!grade.solvable || !grade.level) return;
  recordExamples(p, grade.level);
  if (!want(grade.level) || pools[grade.level].length >= POOL[grade.level]) return;
  if (!hasUniqueSolution(puzzle)) throw new Error('generator produced a non-unique puzzle');
  seenPuzzles.add(p);
  seenSolutions.add(sol);
  pools[grade.level].push({ puzzle: p, solution: sol, grade, index: difficultyIndex(grade) });
}

const LEVEL_RANK: Record<LevelId, number> = { beginner: 0, easy: 1, medium: 2, hard: 3, expert: 4 };

/** Remember one real position per technique for the in-app technique guide. */
function recordExamples(puzzle: string, level: LevelId): void {
  const missing = TECHNIQUES.some((t) => !examples[t.id] || LEVEL_RANK[examples[t.id]!.level] > LEVEL_RANK[level]);
  if (!missing) return;
  const { steps } = solveLogically(parseGrid(puzzle));
  steps.forEach((s, i) => {
    const cur = examples[s.technique];
    if (!cur || LEVEL_RANK[cur.level] > LEVEL_RANK[level]) examples[s.technique] = { puzzle, step: i, level };
  });
}

const t0 = Date.now();
let attempts = 0;

// Beginner: many clues (37-46), singles only.
while (pools.beginner.length < POOL.beginner) {
  attempts++;
  const target = BEGINNER_MIN_GIVENS + rng.int(10);
  const { puzzle, solution } = generatePuzzle({ rng, targetGivens: target });
  consider(puzzle, solution, (l) => l === 'beginner');
}

// Easy: 26-36 clues, singles only. Mix targeted and minimal digs for a range.
while (pools.easy.length < POOL.easy) {
  attempts++;
  const target = rng.next() < 0.6 ? 30 + rng.int(7) : 17;
  const { puzzle, solution } = generatePuzzle({ rng, targetGivens: target });
  consider(puzzle, solution, (l) => l === 'easy');
}

// Medium / Hard / Expert: minimal puzzles bucketed by the hardest technique needed.
while (
  (pools.medium.length < POOL.medium || pools.hard.length < POOL.hard || pools.expert.length < POOL.expert) &&
  attempts < 400_000
) {
  attempts++;
  const { puzzle, solution } = generatePuzzle({ rng });
  consider(puzzle, solution, (l) => l === 'medium' || l === 'hard' || l === 'expert');
}

// Keep hunting for rare techniques so the guide can show a real example of each.
let extra = 0;
while (TECHNIQUES.some((t) => !examples[t.id]) && extra < 120_000) {
  extra++;
  const { puzzle } = generatePuzzle({ rng });
  const grade = gradePuzzle(puzzle);
  if (grade.solvable && grade.level) recordExamples(gridToString(puzzle).replace(/0/g, '.'), grade.level);
}

for (const level of LEVELS) {
  if (pools[level].length < PER_LEVEL) throw new Error(`Only ${pools[level].length} ${level} puzzles found`);
}

/** Pick `n` items spread evenly across a sorted list; returns [picked, rest]. */
function spread<T>(sorted: T[], n: number): [T[], T[]] {
  const picked = new Set<number>();
  for (let k = 0; k < n; k++) picked.add(Math.round((k * (sorted.length - 1)) / (n - 1)));
  let i = 0;
  while (picked.size < n) if (!picked.has(i++)) picked.add(i - 1);
  const a: T[] = [];
  const b: T[] = [];
  sorted.forEach((x, idx) => (picked.has(idx) ? a : b).push(x));
  return [a, b];
}

const stage: Record<LevelId, Candidate[]> = { beginner: [], easy: [], medium: [], hard: [], expert: [] };
const daily: Record<DailyLevel, Candidate[]> = { easy: [], medium: [], hard: [], expert: [] };
for (const level of LEVELS) {
  const sorted = [...pools[level]].sort((x, y) => x.index - y.index);
  const [picked, rest] = spread(sorted, PER_LEVEL);
  stage[level] = picked;
  if (level !== 'beginner') {
    const want = DAILY_SIZES[level as DailyLevel];
    if (rest.length < want) throw new Error(`Not enough spare ${level} puzzles for the daily pool`);
    daily[level as DailyLevel] = spread(rest, want)[0];
  }
}

// ---------------------------------------------------------------------------
// report + write

const lines: string[] = [];
const summary: string[] = [];
for (const level of LEVELS) {
  const list = stage[level];
  const tech: Record<string, number> = {};
  for (const c of list) tech[c.grade.hardest!] = (tech[c.grade.hardest!] ?? 0) + 1;
  const g = list.map((c) => c.grade.givens);
  summary.push(
    `//   ${level.padEnd(8)} givens ${Math.min(...g)}-${Math.max(...g)}, hardest: ` +
      Object.entries(tech)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${v}`)
        .join(', '),
  );
}

lines.push('// Generated by scripts/generate-puzzles.ts — do not edit by hand.');
lines.push(`// Seed: ${SEED}. Each string is 81 cells, "." = empty.`);
lines.push('// Every puzzle has exactly one solution and is solvable by logic alone.');
lines.push(...summary);
lines.push('');
lines.push("import type { LevelId } from '../engine/grade.ts';");
lines.push("import type { TechniqueId } from '../engine/logic.ts';");
lines.push('');
lines.push('/** 100 puzzles per level, ordered easiest to hardest (10 stages × 10). */');
lines.push('export const STAGE_PUZZLES: Record<LevelId, readonly string[]> = {');
for (const level of LEVELS) {
  lines.push(`  ${level}: [`);
  for (const c of stage[level]) lines.push(`    '${c.puzzle}',`);
  lines.push('  ],');
}
lines.push('};');
lines.push('');
lines.push('/** Separate pools for the daily challenge (never used in stages). */');
lines.push(`export const DAILY_POOLS: Record<'easy' | 'medium' | 'hard' | 'expert', readonly string[]> = {`);
for (const level of Object.keys(daily) as DailyLevel[]) {
  lines.push(`  ${level}: [`);
  for (const c of daily[level]) lines.push(`    '${c.puzzle}',`);
  lines.push('  ],');
}
lines.push('};');
lines.push('');
lines.push('/** A real position for each technique: replay the logical solver `step` steps. */');
lines.push('export const TECHNIQUE_EXAMPLES: Partial<Record<TechniqueId, { puzzle: string; step: number }>> = {');
for (const t of TECHNIQUES) {
  const ex = examples[t.id];
  if (ex) lines.push(`  ${t.id}: { puzzle: '${ex.puzzle}', step: ${ex.step} },`);
}
lines.push('};');
lines.push('');

const out = fileURLToPath(new URL('../src/data/puzzles.ts', import.meta.url));
writeFileSync(out, lines.join('\n'));
console.log(summary.map((s) => s.replace('//  ', '')).join('\n'));
console.log(`examples: ${Object.keys(examples).length}/${TECHNIQUES.length} techniques`);
console.log(`attempts: ${attempts + extra}, ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${out}`);
