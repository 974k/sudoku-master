// Validity-preserving Sudoku symmetries: relabel digits, permute rows within
// bands, bands, columns within stacks, stacks, and optionally transpose.
// A transformed puzzle has the same number of solutions and needs exactly the
// same solving techniques as the original, but looks like a new puzzle.

import type { Grid } from './board.ts';
import type { Rng } from './rng.ts';

export interface Transform {
  digits: number[]; // digits[old] = new, index 0 unused
  rows: number[]; // new row r takes old row rows[r]
  cols: number[];
  transpose: boolean;
}

function lineOrder(rng: Rng): number[] {
  const bands = rng.shuffle([0, 1, 2]);
  const out: number[] = [];
  for (const b of bands) for (const r of rng.shuffle([0, 1, 2])) out.push(b * 3 + r);
  return out;
}

export function randomTransform(rng: Rng): Transform {
  return {
    digits: [0, ...rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])],
    rows: lineOrder(rng),
    cols: lineOrder(rng),
    transpose: rng.next() < 0.5,
  };
}

export function applyTransform(grid: ArrayLike<number>, t: Transform): Grid {
  const out = new Uint8Array(81);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const or = t.rows[r]!;
      const oc = t.cols[c]!;
      const src = t.transpose ? oc * 9 + or : or * 9 + oc;
      out[r * 9 + c] = t.digits[grid[src] ?? 0]!;
    }
  }
  return out;
}
