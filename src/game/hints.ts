// Teaching hints: find the next logical placement from the player's current
// position and explain the (minimal) chain of deductions that leads to it.

import { CELL_UNITS, UNITS } from '../engine/board.ts';
import { explainStep, type Explanation } from '../engine/explain.ts';
import { applyStep, cloneState, createState, findNextStep, type Candidate, type LogicState, type Step } from '../engine/logic.ts';
import type { Game } from './game.ts';

export interface HintStep {
  step: Step;
  explanation: Explanation;
}

export type Hint =
  | { kind: 'mistake'; cells: number[] }
  | { kind: 'logic'; steps: HintStep[]; placement: Candidate }
  | { kind: 'reveal'; placement: Candidate }
  | { kind: 'solved' };

const key = (cell: number, digit: number): number => cell * 10 + digit;

/** Candidates (cell*10+digit) whose presence or absence the step relies on. */
function dependencies(step: Step): Set<number> {
  const deps = new Set<number>();
  const allDigits = (c: number) => {
    for (let d = 1; d <= 9; d++) deps.add(key(c, d));
  };
  const unitDigits = (u: number, digits: readonly number[]) => {
    for (const c of UNITS[u]!) for (const d of digits) deps.add(key(c, d));
  };
  if (step.placement) {
    const { cell, digit } = step.placement;
    if (step.technique === 'nakedSingle') allDigits(cell);
    else if (step.technique !== 'fullHouse') unitDigits(step.units[0]!, [digit]);
    return deps;
  }
  for (const c of step.cells) allDigits(c);
  for (const u of step.units) unitDigits(u, step.digits);
  if (step.technique === 'simpleColoring') {
    for (const c of step.cells) for (const u of CELL_UNITS[c]!) unitDigits(u, step.digits);
  }
  return deps;
}

/**
 * Drop elimination steps that don't (transitively) contribute to the final
 * placement, so the hint only explains what matters.
 */
function prune(steps: Step[]): Step[] {
  const needed = dependencies(steps[steps.length - 1]!);
  const keep: Step[] = [steps[steps.length - 1]!];
  for (let i = steps.length - 2; i >= 0; i--) {
    const s = steps[i]!;
    if (!s.eliminations.some((e) => needed.has(key(e.cell, e.digit)))) continue;
    keep.unshift(s);
    for (const k of dependencies(s)) needed.add(k);
  }
  return keep;
}

export function nextLogicalSteps(start: LogicState, maxSteps = 60): Step[] | null {
  const state = cloneState(start);
  const steps: Step[] = [];
  for (let n = 0; n < maxSteps; n++) {
    const step = findNextStep(state);
    if (!step) return null;
    steps.push(step);
    if (step.placement) return steps;
    applyStep(state, step);
  }
  return null;
}

export function buildHint(game: Game, preferCell?: number): Hint {
  if (game.isSolved()) return { kind: 'solved' };
  const wrong: number[] = [];
  for (let i = 0; i < 81; i++) if (game.isWrong(i)) wrong.push(i);
  if (wrong.length) return { kind: 'mistake', cells: wrong };

  const start = createState(game.trustedValues());
  const raw = nextLogicalSteps(start);
  if (raw) {
    const steps = prune(raw);
    // replay the kept steps to explain each one against the state it sees
    const state = cloneState(start);
    const out: HintStep[] = [];
    for (const step of steps) {
      out.push({ step, explanation: explainStep(step, state) });
      applyStep(state, step);
    }
    return { kind: 'logic', steps: out, placement: steps[steps.length - 1]!.placement! };
  }

  // Fallback (should not happen for bundled puzzles): reveal a cell.
  let cell = preferCell !== undefined && !game.values[preferCell] ? preferCell : -1;
  if (cell < 0) for (let i = 0; i < 81 && cell < 0; i++) if (!game.values[i]) cell = i;
  return { kind: 'reveal', placement: { cell, digit: game.solution[cell]! } };
}
