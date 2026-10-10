// Exhaustive backtracking solver (bitmasks + minimum-remaining-values).
// Used to prove uniqueness and to build random complete grids. This is the
// "ground truth" checker; the human-style solver lives in logic.ts.

import { ALL_DIGITS, BOX_OF, COL_OF, POPCOUNT, ROW_OF, digitOf, type Grid } from './board.ts';
import type { Rng } from './rng.ts';

export interface SolveResult {
  /** Number of solutions found, capped at `limit`. */
  count: number;
  /** The first solution found, if any. */
  solution: Grid | null;
}

/**
 * Counts solutions up to `limit` (default 2, which is all a uniqueness check
 * needs). Returns count 0 for grids whose givens already conflict.
 */
export function solve(grid: ArrayLike<number>, limit = 2, rng?: Rng): SolveResult {
  const g = new Uint8Array(81);
  const rows = new Uint16Array(9);
  const cols = new Uint16Array(9);
  const boxes = new Uint16Array(9);
  const empties: number[] = [];

  for (let i = 0; i < 81; i++) {
    const d = grid[i] ?? 0;
    if (!d) {
      empties.push(i);
      continue;
    }
    const b = 1 << (d - 1);
    const r = ROW_OF[i]!;
    const c = COL_OF[i]!;
    const x = BOX_OF[i]!;
    if (rows[r]! & b || cols[c]! & b || boxes[x]! & b) return { count: 0, solution: null };
    rows[r]! |= b;
    cols[c]! |= b;
    boxes[x]! |= b;
    g[i] = d;
  }

  let count = 0;
  let solution: Grid | null = null;
  const n = empties.length;
  const order = new Uint8Array(9);

  const dfs = (k: number): boolean => {
    if (k === n) {
      count++;
      if (!solution) solution = g.slice();
      return count >= limit;
    }
    // pick the most constrained remaining cell
    let best = k;
    let bestMask = 0;
    let bestCount = 10;
    for (let j = k; j < n; j++) {
      const i = empties[j]!;
      const mask = ALL_DIGITS & ~(rows[ROW_OF[i]!]! | cols[COL_OF[i]!]! | boxes[BOX_OF[i]!]!);
      const pc = POPCOUNT[mask]!;
      if (pc < bestCount) {
        bestCount = pc;
        bestMask = mask;
        best = j;
        if (pc <= 1) break;
      }
    }
    if (bestCount === 0) return false;
    const i = empties[best]!;
    empties[best] = empties[k]!;
    empties[k] = i;

    const r = ROW_OF[i]!;
    const c = COL_OF[i]!;
    const x = BOX_OF[i]!;

    let m = bestMask;
    let len = 0;
    while (m) {
      const b = m & -m;
      m ^= b;
      order[len++] = digitOf(b);
    }
    if (rng && len > 1) {
      for (let a = len - 1; a > 0; a--) {
        const z = rng.int(a + 1);
        const t = order[a]!;
        order[a] = order[z]!;
        order[z] = t;
      }
    }
    const digits = order.slice(0, len);
    for (const d of digits) {
      const b = 1 << (d - 1);
      g[i] = d;
      rows[r]! |= b;
      cols[c]! |= b;
      boxes[x]! |= b;
      if (dfs(k + 1)) return true;
      rows[r]! &= ~b;
      cols[c]! &= ~b;
      boxes[x]! &= ~b;
    }
    g[i] = 0;
    return false;
  };

  dfs(0);
  return { count, solution };
}

export function hasUniqueSolution(grid: ArrayLike<number>): boolean {
  return solve(grid, 2).count === 1;
}

/** The unique solution, or null if the puzzle has zero or several solutions. */
export function uniqueSolution(grid: ArrayLike<number>): Grid | null {
  const r = solve(grid, 2);
  return r.count === 1 ? r.solution : null;
}

/** A uniformly shuffled complete valid grid. */
export function randomSolvedGrid(rng: Rng): Grid {
  const empty = new Uint8Array(81);
  // seed the three diagonal boxes (independent), then complete randomly
  for (const box of [0, 4, 8]) {
    const digits = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const r0 = Math.floor(box / 3) * 3;
    const c0 = (box % 3) * 3;
    let k = 0;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) empty[(r0 + r) * 9 + c0 + c] = digits[k++]!;
  }
  const res = solve(empty, 1, rng);
  if (!res.solution) throw new Error('Failed to build a solved grid');
  return res.solution;
}
