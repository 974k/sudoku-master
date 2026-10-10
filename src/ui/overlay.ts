// Turns a logical step into board highlights (used by hints and the guide).

import { BOX_OF, COL_OF, ROW_OF, UNITS, sees } from '../engine/board.ts';
import type { LogicState, Step } from '../engine/logic.ts';
import type { CandMark, HintOverlay } from './board.ts';

/** Highlights for a gentle nudge: just where to look. */
export function nudgeOverlay(step: Step): HintOverlay | null {
  const u = step.units[0];
  if (u !== undefined) return { unitCells: new Set(UNITS[u]) };
  if (step.technique === 'nakedSingle') return { unitCells: new Set(UNITS[ROW_OF[step.placement!.cell]!]) };
  return null;
}

/** Full teaching highlights for a step, drawn against the state it was found in. */
export function stepOverlay(step: Step, state: LogicState): HintOverlay {
  const unitCells = new Set<number>();
  for (const u of step.units) for (const c of UNITS[u]!) unitCells.add(c);
  const ov: HintOverlay = {
    unitCells,
    pattern: new Set(step.cells.filter((c) => c !== step.placement?.cell)),
    targets: new Set(step.eliminations.map((e) => e.cell)),
  };
  if (step.placement) {
    const { cell, digit } = step.placement;
    ov.place = cell;
    if (step.technique === 'nakedSingle') {
      for (const u of [ROW_OF[cell]!, 9 + COL_OF[cell]!, 18 + BOX_OF[cell]!]) for (const x of UNITS[u]!) unitCells.add(x);
    }
    if (step.technique === 'hiddenSingleBox' || step.technique === 'hiddenSingleLine') {
      // the digits that rule out the unit's other empty cells
      const empties = UNITS[step.units[0]!]!.filter((c) => !state.values[c] && c !== cell);
      const blockers = new Set<number>();
      for (let j = 0; j < 81; j++) if (state.values[j] === digit && empties.some((e) => sees(e, j))) blockers.add(j);
      ov.pattern = blockers;
    }
  }
  if (step.colors) {
    ov.colorA = new Set(step.colors[0]);
    ov.colorB = new Set(step.colors[1]);
  }
  if (step.eliminations.length) {
    // eliminations are about candidates: show them all, marking the pattern
    const marks = new Map<number, Map<number, CandMark>>();
    const mark = (c: number, d: number, m: CandMark) => {
      if (!marks.has(c)) marks.set(c, new Map());
      marks.get(c)!.set(d, m);
    };
    for (const c of step.cells) for (const d of step.digits) if (state.cands[c]! & (1 << (d - 1))) mark(c, d, 'pattern');
    if (step.colors) {
      const d = step.digits[0]!;
      for (const c of step.colors[0]) mark(c, d, 'a');
      for (const c of step.colors[1]) mark(c, d, 'b');
    }
    for (const e of step.eliminations) mark(e.cell, e.digit, 'elim');
    ov.cands = state.cands;
    ov.marks = marks;
  }
  return ov;
}
