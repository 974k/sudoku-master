// Plain-language explanations of logical steps, for hints and the guide.

import { BOX_OF, COL_OF, ROW_OF, UNITS, bit, cellName, digitsOf, sees, unitKind, unitName } from './board.ts';
import { TECHNIQUE_BY_ID, type Candidate, type LogicState, type Step } from './logic.ts';

export interface Explanation {
  title: string;
  /** A gentle nudge that names the technique and where to look. */
  nudge: string;
  /** The full reasoning. */
  detail: string;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function list(items: readonly (string | number)[]): string {
  const xs = items.map(String);
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

function orList(items: readonly (string | number)[]): string {
  const xs = items.map(String);
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`;
}

function cellSet(state: LogicState, cell: number): string {
  return `{${digitsOf(state.cands[cell]!).join(',')}}`;
}

/** "R5C3 (4), R9C8 (4, 6)" */
export function describeEliminations(elims: readonly Candidate[]): string {
  const byCell = new Map<number, number[]>();
  for (const e of elims) {
    if (!byCell.has(e.cell)) byCell.set(e.cell, []);
    byCell.get(e.cell)!.push(e.digit);
  }
  return [...byCell.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([c, ds]) => `${cellName(c)} (${ds.sort().join(', ')})`)
    .join(', ');
}

function where(step: Step): string {
  if (step.units.length) return unitName(step.units[0]!);
  const c = step.placement?.cell ?? step.cells[0];
  return c === undefined ? 'the grid' : `row ${ROW_OF[c]! + 1}, column ${COL_OF[c]! + 1}`;
}

export function friendlyCell(c: number): string {
  return `row ${ROW_OF[c]! + 1}, column ${COL_OF[c]! + 1}`;
}

/** Digits present in a cell's row, column and box, attributed to the first unit they appear in. */
export function seenDigits(values: ArrayLike<number>, cell: number): { row: number[]; col: number[]; box: number[] } {
  const seen = new Set<number>();
  const take = (unit: number): number[] => {
    const out: number[] = [];
    for (const i of UNITS[unit]!) {
      const d = values[i] ?? 0;
      if (d && !seen.has(d)) {
        seen.add(d);
        out.push(d);
      }
    }
    return out.sort((a, b) => a - b);
  };
  return { row: take(ROW_OF[cell]!), col: take(9 + COL_OF[cell]!), box: take(18 + BOX_OF[cell]!) };
}

export function explainStep(step: Step, before: LogicState): Explanation {
  const info = TECHNIQUE_BY_ID[step.technique];
  const title = info.name;
  const d = step.digits[0]!;
  const elims = describeEliminations(step.eliminations);
  const nudge = `Look for a ${title} in ${where(step)}.`;

  switch (step.technique) {
    case 'fullHouse': {
      const { cell, digit } = step.placement!;
      return {
        title,
        nudge: `${cap(unitName(step.units[0]!))} is almost complete.`,
        detail: `${cap(unitName(step.units[0]!))} has only one empty cell left (${friendlyCell(cell)}). The only digit it is missing is ${digit}.`,
      };
    }
    case 'nakedSingle': {
      const { cell, digit } = step.placement!;
      const s = seenDigits(before.values, cell);
      const parts: string[] = [];
      if (s.row.length) parts.push(`its row has ${list(s.row)}`);
      if (s.col.length) parts.push(`its column has ${list(s.col)}`);
      if (s.box.length) parts.push(`its box has ${list(s.box)}`);
      const blocked = 8 - (s.row.length + s.col.length + s.box.length);
      const extra = blocked > 0 ? ' Earlier deductions have ruled out the rest.' : '';
      return {
        title,
        nudge: `One cell in row ${ROW_OF[cell]! + 1} has only one possible digit.`,
        detail: `Look at ${friendlyCell(cell)}: ${list(parts)}.${extra} The only digit left for this cell is ${digit}.`,
      };
    }
    case 'hiddenSingleBox':
    case 'hiddenSingleLine': {
      const { cell, digit } = step.placement!;
      const u = step.units[0]!;
      const kind = unitKind(u);
      const others = kind === 'box' ? 'row or column' : kind === 'row' ? 'column or box' : 'row or box';
      return {
        title,
        nudge: `Look at where ${digit} can go in ${unitName(u)}.`,
        detail: `In ${unitName(u)}, the ${digit} can only go in ${friendlyCell(cell)}. Every other empty cell there already sees a ${digit} in its ${others}${
          blockersFromEliminations(before, u, digit) ? ', or has had it ruled out' : ''
        }.`,
      };
    }
    case 'pointing': {
      const [box, line] = step.units as [number, number];
      return {
        title,
        nudge,
        detail: `In ${unitName(box)}, every possible place for ${d} lies in ${unitName(line)}. So the ${d} of ${unitName(line)} must be inside ${unitName(box)}, and ${d} can be removed from the rest of ${unitName(line)}: ${elims}.`,
      };
    }
    case 'claiming': {
      const [line, box] = step.units as [number, number];
      return {
        title,
        nudge,
        detail: `In ${unitName(line)}, the ${d} can only go in cells that are inside ${unitName(box)}. So the ${d} of ${unitName(box)} must be in ${unitName(line)}, and ${d} can be removed from the other cells of the box: ${elims}.`,
      };
    }
    case 'nakedPair':
    case 'nakedTriple':
    case 'nakedQuad': {
      const n = step.cells.length;
      const word = ['', '', 'two', 'three', 'four'][n];
      return {
        title,
        nudge,
        detail: `In ${unitName(step.units[0]!)}, the ${word} cells ${list(step.cells.map(cellName))} can only hold ${orList(step.digits)}. Those ${word} digits must fill those ${word} cells, so no other cell in the ${unitKind(step.units[0]!)} can contain them. Remove: ${elims}.`,
      };
    }
    case 'hiddenPair':
    case 'hiddenTriple':
    case 'hiddenQuad': {
      const n = step.digits.length;
      const word = ['', '', 'two', 'three', 'four'][n];
      return {
        title,
        nudge,
        detail: `In ${unitName(step.units[0]!)}, the digits ${list(step.digits)} fit only in the ${word} cells ${list(step.cells.map(cellName))}. Those cells must hold exactly these digits, so every other candidate can be removed from them: ${elims}.`,
      };
    }
    case 'xWing':
    case 'swordfish':
    case 'jellyfish': {
      const n = step.technique === 'xWing' ? 2 : step.technique === 'swordfish' ? 3 : 4;
      const base = step.units.slice(0, n);
      const cover = step.units.slice(n);
      const baseKind = unitKind(base[0]!) === 'row' ? 'rows' : 'columns';
      const coverKind = baseKind === 'rows' ? 'columns' : 'rows';
      const num = (u: number) => (u % 9) + 1;
      return {
        title,
        nudge: `Look at the ${d}s in ${baseKind} ${list(base.map(num))}.`,
        detail: `In ${baseKind} ${list(base.map(num))}, the ${d} can only go in ${coverKind} ${list(cover.map(num))}. However they are placed, those ${baseKind} will use up the ${d} of each of those ${coverKind}, so no other cell in ${coverKind} ${list(cover.map(num))} can be ${d}. Remove ${d} from: ${elims}.`,
      };
    }
    case 'skyscraper': {
      const [end1, base1, base2, end2] = step.chain as [number, number, number, number];
      const lineKind = ROW_OF[base1] !== ROW_OF[end1] ? 'columns' : 'rows';
      const coverName = lineKind === 'rows' ? `column ${COL_OF[base1]! + 1}` : `row ${ROW_OF[base1]! + 1}`;
      const l1 = lineKind === 'rows' ? ROW_OF[base1]! + 1 : COL_OF[base1]! + 1;
      const l2 = lineKind === 'rows' ? ROW_OF[base2]! + 1 : COL_OF[base2]! + 1;
      return {
        title,
        nudge: `Look at ${lineKind} with exactly two places for ${d}.`,
        detail: `${cap(lineKind)} ${l1} and ${l2} each have exactly two places for ${d}, and one end of each lines up in ${coverName} (${cellName(base1)} and ${cellName(base2)}). At most one of those can be ${d}, so at least one of the other ends, ${cellName(end1)} or ${cellName(end2)}, must be ${d}. Any cell that sees both of them can't be ${d}: ${elims}.`,
      };
    }
    case 'twoStringKite': {
      const [ra, rb, cb, ca] = step.chain as [number, number, number, number];
      return {
        title,
        nudge: `Look for a row and a column that each have two places for ${d}.`,
        detail: `Row ${ROW_OF[ra]! + 1} has exactly two places for ${d} (${cellName(ra)} and ${cellName(rb)}), and column ${COL_OF[ca]! + 1} has exactly two (${cellName(cb)} and ${cellName(ca)}). ${cellName(rb)} and ${cellName(cb)} share a box, so they can't both be ${d}. That means ${cellName(ra)} or ${cellName(ca)} must be ${d}, and any cell that sees both can't be: ${elims}.`,
      };
    }
    case 'xyWing': {
      const [p, a, c] = step.cells as [number, number, number];
      const z = step.eliminations[0]!.digit;
      return {
        title,
        nudge: `Look for three cells with two candidates each, around ${cellName(p)}.`,
        detail: `The pivot ${cellName(p)} holds ${cellSet(before, p)}. It sees ${cellName(a)} ${cellSet(before, a)} and ${cellName(c)} ${cellSet(before, c)}. Whichever value the pivot takes, one of those two wings is forced to ${z}. So any cell that sees both wings can't be ${z}: ${elims}.`,
      };
    }
    case 'xyzWing': {
      const [p, a, c] = step.cells as [number, number, number];
      const z = step.eliminations[0]!.digit;
      return {
        title,
        nudge: `Look at ${cellName(p)}, which has three candidates.`,
        detail: `The pivot ${cellName(p)} holds ${cellSet(before, p)} and sees ${cellName(a)} ${cellSet(before, a)} and ${cellName(c)} ${cellSet(before, c)}. One of these three cells must be ${z}, so any cell that sees all three can't be ${z}: ${elims}.`,
      };
    }
    case 'wWing': {
      const [a, la, lc, c] = step.chain as [number, number, number, number];
      const [link, other] = step.digits as [number, number];
      return {
        title,
        nudge: `Look for two matching two-candidate cells ${cellSet(before, a)}.`,
        detail: `${cellName(a)} and ${cellName(c)} both hold ${cellSet(before, a)}. In ${unitName(step.units[0]!)} the ${link} can only go in ${cellName(la)} or ${cellName(lc)}, which see those two cells. If ${cellName(a)} were ${link}, then ${cellName(la)} isn't, so ${cellName(lc)} is ${link} and ${cellName(c)} must be ${other}. Either way one of the pair is ${other}, so any cell seeing both can't be ${other}: ${elims}.`,
      };
    }
    case 'simpleColoring': {
      const [blue, green] = step.colors!;
      const wrapBlue = step.eliminations.length === blue.length && step.eliminations.every((e) => blue.includes(e.cell));
      const wrapGreen = step.eliminations.length === green.length && step.eliminations.every((e) => green.includes(e.cell));
      const head = `Follow the ${d}s that are linked in pairs (a row, column or box with exactly two places for ${d}) and colour them alternately: one colour is ${list(blue.map(cellName))}, the other ${list(green.map(cellName))}. Exactly one colour holds the true ${d}s.`;
      const tail =
        wrapBlue || wrapGreen
          ? ` Two cells of the same colour see each other, so that colour can't be true. Remove ${d} from every cell of that colour: ${elims}.`
          : ` Cells that see both colours can't be ${d}: ${elims}.`;
      return { title, nudge: `Follow the paired-up ${d}s across the grid.`, detail: head + tail };
    }
    case 'xyChain': {
      const chain = step.chain!;
      const z = d;
      const forced: string[] = [];
      let out = digitsOf(before.cands[chain[0]!]! & ~bit(z))[0]!;
      forced.push(`${cellName(chain[0]!)} is ${out}`);
      for (let k = 1; k < chain.length; k++) {
        const cand = before.cands[chain[k]!]!;
        out = digitsOf(cand & ~bit(out))[0]!;
        forced.push(`${cellName(chain[k]!)} is ${out}`);
      }
      const start = chain[0]!;
      const end = chain[chain.length - 1]!;
      return {
        title,
        nudge: `Look for a chain of two-candidate cells starting at ${cellName(start)}.`,
        detail: `Suppose ${cellName(start)} is not ${z}. Then ${forced.join(', so ')}. So either ${cellName(start)} or ${cellName(end)} is ${z}, and any cell that sees both can't be ${z}: ${elims}.`,
      };
    }
  }
}

/** True when some empty cell of the unit lacks digit d without a visible blocker. */
function blockersFromEliminations(s: LogicState, unit: number, d: number): boolean {
  for (const i of UNITS[unit]!) {
    if (s.values[i] || s.cands[i]! & bit(d)) continue;
    let blocked = false;
    for (let j = 0; j < 81 && !blocked; j++) if (s.values[j] === d && sees(i, j)) blocked = true;
    if (!blocked) return true;
  }
  return false;
}
