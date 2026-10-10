// Human-style logical solver.
//
// Each technique inspects a candidate state and returns one deduction (a
// placement or a set of eliminations) together with the cells/units/digits
// that justify it. Techniques are always tried simplest-first, which is what
// makes the solver usable both for grading difficulty and for teaching hints.
// No technique ever guesses; every deduction is forced by the current state.

import {
  ALL_DIGITS,
  BOX_OF,
  COL_OF,
  PEERS,
  POPCOUNT,
  ROW_OF,
  UNITS,
  bit,
  computeCandidates,
  digitOf,
  digitsOf,
  sees,
} from './board.ts';

export type TechniqueId =
  | 'fullHouse'
  | 'hiddenSingleBox'
  | 'nakedSingle'
  | 'hiddenSingleLine'
  | 'pointing'
  | 'claiming'
  | 'nakedPair'
  | 'hiddenPair'
  | 'nakedTriple'
  | 'hiddenTriple'
  | 'xWing'
  | 'skyscraper'
  | 'twoStringKite'
  | 'nakedQuad'
  | 'xyWing'
  | 'hiddenQuad'
  | 'xyzWing'
  | 'wWing'
  | 'swordfish'
  | 'simpleColoring'
  | 'jellyfish'
  | 'xyChain';

export type TechniqueTier = 'singles' | 'medium' | 'hard' | 'expert';

export interface TechniqueInfo {
  id: TechniqueId;
  name: string;
  weight: number;
  tier: TechniqueTier;
}

/** In application order (simplest first). */
export const TECHNIQUES: readonly TechniqueInfo[] = [
  { id: 'fullHouse', name: 'Full House', weight: 1.0, tier: 'singles' },
  { id: 'hiddenSingleBox', name: 'Hidden Single', weight: 1.2, tier: 'singles' },
  { id: 'nakedSingle', name: 'Naked Single', weight: 1.5, tier: 'singles' },
  { id: 'hiddenSingleLine', name: 'Hidden Single', weight: 1.8, tier: 'singles' },
  { id: 'pointing', name: 'Pointing Pair', weight: 2.6, tier: 'medium' },
  { id: 'claiming', name: 'Box/Line Reduction', weight: 2.8, tier: 'medium' },
  { id: 'nakedPair', name: 'Naked Pair', weight: 3.0, tier: 'medium' },
  { id: 'hiddenPair', name: 'Hidden Pair', weight: 3.4, tier: 'medium' },
  { id: 'nakedTriple', name: 'Naked Triple', weight: 3.6, tier: 'medium' },
  { id: 'hiddenTriple', name: 'Hidden Triple', weight: 4.0, tier: 'hard' },
  { id: 'xWing', name: 'X-Wing', weight: 4.2, tier: 'hard' },
  { id: 'skyscraper', name: 'Skyscraper', weight: 4.3, tier: 'hard' },
  { id: 'twoStringKite', name: '2-String Kite', weight: 4.4, tier: 'hard' },
  { id: 'nakedQuad', name: 'Naked Quad', weight: 4.6, tier: 'hard' },
  { id: 'xyWing', name: 'XY-Wing', weight: 4.6, tier: 'hard' },
  { id: 'hiddenQuad', name: 'Hidden Quad', weight: 4.8, tier: 'hard' },
  { id: 'xyzWing', name: 'XYZ-Wing', weight: 4.8, tier: 'hard' },
  { id: 'wWing', name: 'W-Wing', weight: 4.9, tier: 'hard' },
  { id: 'swordfish', name: 'Swordfish', weight: 5.2, tier: 'expert' },
  { id: 'simpleColoring', name: 'Simple Coloring', weight: 5.4, tier: 'expert' },
  { id: 'jellyfish', name: 'Jellyfish', weight: 5.8, tier: 'expert' },
  { id: 'xyChain', name: 'XY-Chain', weight: 6.2, tier: 'expert' },
];

export const TECHNIQUE_BY_ID: Readonly<Record<TechniqueId, TechniqueInfo>> = Object.fromEntries(
  TECHNIQUES.map((t) => [t.id, t]),
) as Record<TechniqueId, TechniqueInfo>;

export interface Candidate {
  cell: number;
  digit: number;
}

export interface Step {
  technique: TechniqueId;
  placement?: Candidate;
  eliminations: Candidate[];
  /** Cells forming the pattern that justifies the deduction. */
  cells: number[];
  /** Units the pattern lives in (first is the primary one). */
  units: number[];
  /** Digits the pattern is about. */
  digits: number[];
  /** Two-colour groups for coloring, or the ordered cells of a chain. */
  colors?: [number[], number[]];
  chain?: number[];
}

export interface LogicState {
  values: Uint8Array;
  cands: Uint16Array;
}

export function createState(grid: ArrayLike<number>): LogicState {
  const values = Uint8Array.from({ length: 81 }, (_, i) => grid[i] ?? 0);
  return { values, cands: computeCandidates(values) };
}

export function cloneState(s: LogicState): LogicState {
  return { values: s.values.slice(), cands: s.cands.slice() };
}

export function placeDigit(s: LogicState, cell: number, d: number): void {
  s.values[cell] = d;
  s.cands[cell] = 0;
  const b = ~bit(d);
  for (const p of PEERS[cell]!) s.cands[p]! &= b;
}

export function applyStep(s: LogicState, step: Step): void {
  if (step.placement) placeDigit(s, step.placement.cell, step.placement.digit);
  for (const e of step.eliminations) s.cands[e.cell]! &= ~bit(e.digit);
}

export function isComplete(s: LogicState): boolean {
  for (let i = 0; i < 81; i++) if (!s.values[i]) return false;
  return true;
}

/** True if some empty cell has no candidates or some digit has no home in a unit. */
export function hasContradiction(s: LogicState): boolean {
  for (let i = 0; i < 81; i++) if (!s.values[i] && !s.cands[i]) return true;
  for (const unit of UNITS) {
    let covered = 0;
    for (const i of unit) covered |= s.values[i] ? bit(s.values[i]!) : s.cands[i]!;
    if (covered !== ALL_DIGITS) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// helpers

const BOX_UNITS = Array.from({ length: 9 }, (_, i) => 18 + i);
const LINE_UNITS = Array.from({ length: 18 }, (_, i) => i);
const ALL_UNITS = Array.from({ length: 27 }, (_, i) => i);

function placedInUnit(s: LogicState, u: number, d: number): boolean {
  for (const i of UNITS[u]!) if (s.values[i] === d) return true;
  return false;
}

/** Cells of a unit where `d` is still a candidate. */
function positions(s: LogicState, u: number, d: number): number[] {
  const b = bit(d);
  const out: number[] = [];
  for (const i of UNITS[u]!) if (s.cands[i]! & b) out.push(i);
  return out;
}

function combinations<T>(items: readonly T[], k: number, fn: (combo: T[]) => boolean): boolean {
  const combo: T[] = [];
  const rec = (start: number): boolean => {
    if (combo.length === k) return fn(combo);
    for (let i = start; i <= items.length - (k - combo.length); i++) {
      combo.push(items[i]!);
      if (rec(i + 1)) return true;
      combo.pop();
    }
    return false;
  };
  return rec(0);
}

function elimsFor(s: LogicState, cells: Iterable<number>, d: number, exclude: readonly number[] = []): Candidate[] {
  const b = bit(d);
  const out: Candidate[] = [];
  for (const c of cells) if (!exclude.includes(c) && s.cands[c]! & b) out.push({ cell: c, digit: d });
  return out;
}

/** Cells holding candidate d that see every target cell. */
function seeingAll(s: LogicState, d: number, targets: readonly number[]): Candidate[] {
  const b = bit(d);
  const out: Candidate[] = [];
  for (const c of PEERS[targets[0]!]!) {
    if (!(s.cands[c]! & b) || targets.includes(c)) continue;
    if (targets.every((t) => sees(c, t))) out.push({ cell: c, digit: d });
  }
  return out;
}

const cellAt = (rowsBase: boolean, line: number, cover: number): number =>
  rowsBase ? line * 9 + cover : cover * 9 + line;

// ---------------------------------------------------------------------------
// singles

function findFullHouse(s: LogicState): Step | null {
  for (const u of ALL_UNITS) {
    let empty = -1;
    let count = 0;
    let used = 0;
    for (const i of UNITS[u]!) {
      if (s.values[i]) used |= bit(s.values[i]!);
      else {
        count++;
        empty = i;
      }
    }
    if (count !== 1) continue;
    const d = digitOf(ALL_DIGITS & ~used);
    if (!(s.cands[empty]! & bit(d))) continue;
    return { technique: 'fullHouse', placement: { cell: empty, digit: d }, eliminations: [], cells: [empty], units: [u], digits: [d] };
  }
  return null;
}

function findHiddenSingle(s: LogicState, units: readonly number[], technique: TechniqueId): Step | null {
  for (const u of units) {
    for (let d = 1; d <= 9; d++) {
      const b = bit(d);
      let count = 0;
      let pos = -1;
      let placed = false;
      for (const i of UNITS[u]!) {
        if (s.values[i] === d) {
          placed = true;
          break;
        }
        if (s.cands[i]! & b) {
          count++;
          pos = i;
        }
      }
      if (!placed && count === 1) {
        return { technique, placement: { cell: pos, digit: d }, eliminations: [], cells: [pos], units: [u], digits: [d] };
      }
    }
  }
  return null;
}

function findNakedSingle(s: LogicState): Step | null {
  for (let i = 0; i < 81; i++) {
    if (s.values[i] || POPCOUNT[s.cands[i]!] !== 1) continue;
    const d = digitOf(s.cands[i]!);
    return { technique: 'nakedSingle', placement: { cell: i, digit: d }, eliminations: [], cells: [i], units: [], digits: [d] };
  }
  return null;
}

// ---------------------------------------------------------------------------
// intersections

function findPointing(s: LogicState): Step | null {
  for (const u of BOX_UNITS) {
    for (let d = 1; d <= 9; d++) {
      const pos = positions(s, u, d);
      if (pos.length < 2 || pos.length > 3) continue;
      const r = ROW_OF[pos[0]!]!;
      const c = COL_OF[pos[0]!]!;
      let line = -1;
      if (pos.every((i) => ROW_OF[i] === r)) line = r;
      else if (pos.every((i) => COL_OF[i] === c)) line = 9 + c;
      if (line < 0) continue;
      const elims = elimsFor(s, UNITS[line]!, d, pos);
      if (elims.length) return { technique: 'pointing', eliminations: elims, cells: pos, units: [u, line], digits: [d] };
    }
  }
  return null;
}

function findClaiming(s: LogicState): Step | null {
  for (const u of LINE_UNITS) {
    for (let d = 1; d <= 9; d++) {
      const pos = positions(s, u, d);
      if (pos.length < 2 || pos.length > 3) continue;
      const b = BOX_OF[pos[0]!]!;
      if (!pos.every((i) => BOX_OF[i] === b)) continue;
      const elims = elimsFor(s, UNITS[18 + b]!, d, pos);
      if (elims.length) return { technique: 'claiming', eliminations: elims, cells: pos, units: [u, 18 + b], digits: [d] };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// subsets

function findNakedSubset(s: LogicState, n: number, technique: TechniqueId): Step | null {
  for (const u of ALL_UNITS) {
    const empties = UNITS[u]!.filter((i) => !s.values[i]);
    if (empties.length <= n) continue;
    const pool = empties.filter((i) => {
      const pc = POPCOUNT[s.cands[i]!]!;
      return pc >= 2 && pc <= n;
    });
    if (pool.length < n) continue;
    let found: Step | null = null;
    combinations(pool, n, (combo) => {
      let union = 0;
      for (const i of combo) union |= s.cands[i]!;
      if (POPCOUNT[union] !== n) return false;
      const elims: Candidate[] = [];
      for (const i of empties) {
        if (combo.includes(i)) continue;
        const hit = s.cands[i]! & union;
        if (hit) for (const d of digitsOf(hit)) elims.push({ cell: i, digit: d });
      }
      if (!elims.length) return false;
      found = { technique, eliminations: elims, cells: [...combo], units: [u], digits: digitsOf(union) };
      return true;
    });
    if (found) return found;
  }
  return null;
}

function findHiddenSubset(s: LogicState, n: number, technique: TechniqueId): Step | null {
  for (const u of ALL_UNITS) {
    const empties = UNITS[u]!.filter((i) => !s.values[i]);
    if (empties.length <= n) continue;
    const digitPos: { d: number; cells: number[] }[] = [];
    for (let d = 1; d <= 9; d++) {
      if (placedInUnit(s, u, d)) continue;
      const pos = positions(s, u, d);
      if (pos.length >= 2 && pos.length <= n) digitPos.push({ d, cells: pos });
    }
    if (digitPos.length < n) continue;
    let found: Step | null = null;
    combinations(digitPos, n, (combo) => {
      const cellSet = new Set<number>();
      for (const dp of combo) for (const c of dp.cells) cellSet.add(c);
      if (cellSet.size !== n) return false;
      let keep = 0;
      for (const dp of combo) keep |= bit(dp.d);
      const elims: Candidate[] = [];
      for (const c of cellSet) {
        const extra = s.cands[c]! & ~keep;
        if (extra) for (const d of digitsOf(extra)) elims.push({ cell: c, digit: d });
      }
      if (!elims.length) return false;
      found = {
        technique,
        eliminations: elims,
        cells: [...cellSet].sort((a, b) => a - b),
        units: [u],
        digits: combo.map((dp) => dp.d),
      };
      return true;
    });
    if (found) return found;
  }
  return null;
}

// ---------------------------------------------------------------------------
// fish

function findFish(s: LogicState, n: number, technique: TechniqueId): Step | null {
  for (let d = 1; d <= 9; d++) {
    const b = bit(d);
    for (const rowsBase of [true, false]) {
      const lines: { line: number; mask: number }[] = [];
      for (let line = 0; line < 9; line++) {
        const unit = rowsBase ? line : 9 + line;
        if (placedInUnit(s, unit, d)) continue;
        let mask = 0;
        for (let cover = 0; cover < 9; cover++) if (s.cands[cellAt(rowsBase, line, cover)]! & b) mask |= 1 << cover;
        const pc = POPCOUNT[mask]!;
        if (pc >= 2 && pc <= n) lines.push({ line, mask });
      }
      if (lines.length < n) continue;
      let found: Step | null = null;
      combinations(lines, n, (combo) => {
        let union = 0;
        for (const l of combo) union |= l.mask;
        if (POPCOUNT[union] !== n) return false;
        const baseLines = combo.map((l) => l.line);
        const covers = digitsOf(union).map((x) => x - 1);
        const elims: Candidate[] = [];
        for (const cover of covers) {
          for (let line = 0; line < 9; line++) {
            if (baseLines.includes(line)) continue;
            const cell = cellAt(rowsBase, line, cover);
            if (s.cands[cell]! & b) elims.push({ cell, digit: d });
          }
        }
        if (!elims.length) return false;
        const cells: number[] = [];
        for (const line of baseLines) for (const cover of covers) {
          const cell = cellAt(rowsBase, line, cover);
          if (s.cands[cell]! & b) cells.push(cell);
        }
        const baseUnits = baseLines.map((l) => (rowsBase ? l : 9 + l));
        const coverUnits = covers.map((c) => (rowsBase ? 9 + c : c));
        found = { technique, eliminations: elims, cells, units: [...baseUnits, ...coverUnits], digits: [d] };
        return true;
      });
      if (found) return found;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// single-digit strong-link patterns

/** Lines where `d` has exactly two candidate cells. */
function conjugateLines(s: LogicState, d: number, rowsBase: boolean): { unit: number; a: number; b: number }[] {
  const out: { unit: number; a: number; b: number }[] = [];
  for (let line = 0; line < 9; line++) {
    const unit = rowsBase ? line : 9 + line;
    const pos = positions(s, unit, d);
    if (pos.length === 2) out.push({ unit, a: pos[0]!, b: pos[1]! });
  }
  return out;
}

function findSkyscraper(s: LogicState): Step | null {
  for (let d = 1; d <= 9; d++) {
    for (const rowsBase of [true, false]) {
      const pairs = conjugateLines(s, d, rowsBase);
      const coverOf = rowsBase ? (i: number) => COL_OF[i]! : (i: number) => ROW_OF[i]!;
      for (let x = 0; x < pairs.length; x++) {
        for (let y = x + 1; y < pairs.length; y++) {
          const p = pairs[x]!;
          const q = pairs[y]!;
          for (const [base1, end1] of [[p.a, p.b], [p.b, p.a]] as const) {
            for (const [base2, end2] of [[q.a, q.b], [q.b, q.a]] as const) {
              if (coverOf(base1) !== coverOf(base2) || coverOf(end1) === coverOf(end2)) continue;
              const elims = seeingAll(s, d, [end1, end2]);
              if (elims.length) {
                const coverUnit = rowsBase ? 9 + coverOf(base1) : coverOf(base1);
                return {
                  technique: 'skyscraper',
                  eliminations: elims,
                  cells: [base1, end1, base2, end2],
                  units: [p.unit, q.unit, coverUnit],
                  digits: [d],
                  chain: [end1, base1, base2, end2],
                };
              }
            }
          }
        }
      }
    }
  }
  return null;
}

function findTwoStringKite(s: LogicState): Step | null {
  for (let d = 1; d <= 9; d++) {
    const rows = conjugateLines(s, d, true);
    const cols = conjugateLines(s, d, false);
    for (const r of rows) {
      for (const c of cols) {
        const cells = new Set([r.a, r.b, c.a, c.b]);
        if (cells.size !== 4) continue;
        for (const [rb, ra] of [[r.a, r.b], [r.b, r.a]] as const) {
          for (const [cb, ca] of [[c.a, c.b], [c.b, c.a]] as const) {
            if (BOX_OF[rb] !== BOX_OF[cb]) continue;
            const elims = seeingAll(s, d, [ra, ca]);
            if (elims.length) {
              return {
                technique: 'twoStringKite',
                eliminations: elims,
                cells: [ra, rb, cb, ca],
                units: [r.unit, c.unit, 18 + BOX_OF[rb]!],
                digits: [d],
                chain: [ra, rb, cb, ca],
              };
            }
          }
        }
      }
    }
  }
  return null;
}

function findSimpleColoring(s: LogicState): Step | null {
  for (let d = 1; d <= 9; d++) {
    const b = bit(d);
    const adj = new Map<number, number[]>();
    for (const u of ALL_UNITS) {
      const pos = positions(s, u, d);
      if (pos.length !== 2) continue;
      const [x, y] = pos as [number, number];
      if (!adj.has(x)) adj.set(x, []);
      if (!adj.has(y)) adj.set(y, []);
      adj.get(x)!.push(y);
      adj.get(y)!.push(x);
    }
    const color = new Map<number, 0 | 1>();
    for (const start of adj.keys()) {
      if (color.has(start)) continue;
      const comp: number[] = [];
      const queue = [start];
      color.set(start, 0);
      let consistent = true;
      while (queue.length) {
        const cur = queue.shift()!;
        comp.push(cur);
        for (const nb of adj.get(cur)!) {
          if (!color.has(nb)) {
            color.set(nb, color.get(cur) === 0 ? 1 : 0);
            queue.push(nb);
          } else if (color.get(nb) === color.get(cur)) consistent = false;
        }
      }
      if (!consistent || comp.length < 3) continue;
      const groups: [number[], number[]] = [
        comp.filter((c) => color.get(c) === 0).sort((x, y) => x - y),
        comp.filter((c) => color.get(c) === 1).sort((x, y) => x - y),
      ];
      // colour wrap: two same-coloured cells see each other -> that colour is false
      for (const g of [0, 1] as const) {
        const grp = groups[g];
        let wrap = false;
        for (let i = 0; i < grp.length && !wrap; i++) for (let j = i + 1; j < grp.length; j++) if (sees(grp[i]!, grp[j]!)) wrap = true;
        if (wrap) {
          return {
            technique: 'simpleColoring',
            eliminations: grp.map((cell) => ({ cell, digit: d })),
            cells: comp,
            units: [],
            digits: [d],
            colors: groups,
          };
        }
      }
      // colour trap: an outside cell sees both colours
      const elims: Candidate[] = [];
      for (let i = 0; i < 81; i++) {
        if (!(s.cands[i]! & b) || color.has(i)) continue;
        if (groups[0].some((c) => sees(i, c)) && groups[1].some((c) => sees(i, c))) elims.push({ cell: i, digit: d });
      }
      if (elims.length) {
        return { technique: 'simpleColoring', eliminations: elims, cells: comp, units: [], digits: [d], colors: groups };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// bivalue-cell patterns

function bivalueCells(s: LogicState): number[] {
  const out: number[] = [];
  for (let i = 0; i < 81; i++) if (!s.values[i] && POPCOUNT[s.cands[i]!] === 2) out.push(i);
  return out;
}

function findXYWing(s: LogicState): Step | null {
  const bv = bivalueCells(s);
  for (const p of bv) {
    const mp = s.cands[p]!;
    const wings = bv.filter((c) => c !== p && sees(c, p) && POPCOUNT[s.cands[c]! & mp] === 1);
    for (let i = 0; i < wings.length; i++) {
      for (let j = i + 1; j < wings.length; j++) {
        const a = wings[i]!;
        const c = wings[j]!;
        const ma = s.cands[a]!;
        const mc = s.cands[c]!;
        if ((ma & mp) === (mc & mp)) continue;
        const z = ma & mc & ~mp;
        if (POPCOUNT[z] !== 1) continue;
        const d = digitOf(z);
        const elims = seeingAll(s, d, [a, c]);
        if (elims.length) {
          return { technique: 'xyWing', eliminations: elims, cells: [p, a, c], units: [], digits: digitsOf(mp | ma | mc) };
        }
      }
    }
  }
  return null;
}

function findXYZWing(s: LogicState): Step | null {
  const bv = bivalueCells(s);
  for (let p = 0; p < 81; p++) {
    if (s.values[p] || POPCOUNT[s.cands[p]!] !== 3) continue;
    const mp = s.cands[p]!;
    const wings = bv.filter((c) => sees(c, p) && (s.cands[c]! & ~mp) === 0);
    for (let i = 0; i < wings.length; i++) {
      for (let j = i + 1; j < wings.length; j++) {
        const a = wings[i]!;
        const c = wings[j]!;
        const ma = s.cands[a]!;
        const mc = s.cands[c]!;
        if (ma === mc) continue;
        const z = ma & mc;
        if (POPCOUNT[z] !== 1) continue;
        const d = digitOf(z);
        const elims = seeingAll(s, d, [p, a, c]);
        if (elims.length) {
          return { technique: 'xyzWing', eliminations: elims, cells: [p, a, c], units: [], digits: digitsOf(mp) };
        }
      }
    }
  }
  return null;
}

function findWWing(s: LogicState): Step | null {
  const bv = bivalueCells(s);
  for (let i = 0; i < bv.length; i++) {
    for (let j = i + 1; j < bv.length; j++) {
      const a = bv[i]!;
      const c = bv[j]!;
      const m = s.cands[a]!;
      if (s.cands[c] !== m || sees(a, c)) continue;
      const [x1, x2] = digitsOf(m) as [number, number];
      for (const [link, other] of [[x1, x2], [x2, x1]] as const) {
        const elimsY = seeingAll(s, other, [a, c]);
        if (!elimsY.length) continue;
        for (const u of ALL_UNITS) {
          const pos = positions(s, u, link);
          if (pos.length !== 2) continue;
          const [p, q] = pos as [number, number];
          if (p === a || p === c || q === a || q === c) continue;
          const ok = (sees(p, a) && sees(q, c)) || (sees(p, c) && sees(q, a));
          if (!ok) continue;
          const [la, lc] = sees(p, a) && sees(q, c) ? [p, q] : [q, p];
          return {
            technique: 'wWing',
            eliminations: elimsY,
            cells: [a, la, lc, c],
            units: [u],
            digits: [link, other],
            chain: [a, la, lc, c],
          };
        }
      }
    }
  }
  return null;
}

/**
 * XY-Chain via breadth-first search over implication states (cell, value).
 * Starting from "start != z" (so start = the other digit), each hop to a
 * bivalue peer containing the current value forces that peer to its other
 * digit. Reaching any cell forced to z proves "start = z or end = z", so z
 * can go from every cell that sees both ends. The shortest such chain wins.
 */
function findXYChain(s: LogicState): Step | null {
  const bv = bivalueCells(s);
  if (bv.length < 3) return null;
  const neighbours = new Map<number, number[]>();
  for (const c of bv) neighbours.set(c, bv.filter((o) => o !== c && sees(o, c)));

  let best: Step | null = null;
  for (const start of bv) {
    for (const z of digitsOf(s.cands[start]!)) {
      const firstOut = digitOf(s.cands[start]! & ~bit(z));
      const key = (cell: number, v: number): number => cell * 10 + v;
      const parent = new Map<number, number>([[key(start, firstOut), -1]]);
      let frontier = [key(start, firstOut)];
      while (frontier.length) {
        const next: number[] = [];
        for (const k of frontier) {
          const cur = Math.floor(k / 10);
          const out = k % 10;
          for (const nb of neighbours.get(cur)!) {
            if (nb === start || !(s.cands[nb]! & bit(out))) continue;
            const nbOut = digitOf(s.cands[nb]! & ~bit(out));
            const nk = key(nb, nbOut);
            if (parent.has(nk)) continue;
            parent.set(nk, k);
            next.push(nk);
            if (nbOut !== z) continue;
            const chain: number[] = [];
            for (let p = nk; p !== -1; p = parent.get(p)!) chain.push(Math.floor(p / 10));
            chain.reverse();
            const shortest = (best as Step | null)?.chain?.length ?? Infinity;
            if (chain.length < 4 || shortest <= chain.length) continue;
            const elims = seeingAll(s, z, [start, nb]);
            if (!elims.length) continue;
            best = { technique: 'xyChain', eliminations: elims, cells: [...new Set(chain)], units: [], digits: [z], chain };
          }
        }
        frontier = next;
        if (((best as Step | null)?.chain?.length ?? Infinity) <= 4) break;
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------

const FINDERS: Record<TechniqueId, (s: LogicState) => Step | null> = {
  fullHouse: findFullHouse,
  hiddenSingleBox: (s) => findHiddenSingle(s, BOX_UNITS, 'hiddenSingleBox'),
  nakedSingle: findNakedSingle,
  hiddenSingleLine: (s) => findHiddenSingle(s, LINE_UNITS, 'hiddenSingleLine'),
  pointing: findPointing,
  claiming: findClaiming,
  nakedPair: (s) => findNakedSubset(s, 2, 'nakedPair'),
  hiddenPair: (s) => findHiddenSubset(s, 2, 'hiddenPair'),
  nakedTriple: (s) => findNakedSubset(s, 3, 'nakedTriple'),
  hiddenTriple: (s) => findHiddenSubset(s, 3, 'hiddenTriple'),
  xWing: (s) => findFish(s, 2, 'xWing'),
  skyscraper: findSkyscraper,
  twoStringKite: findTwoStringKite,
  nakedQuad: (s) => findNakedSubset(s, 4, 'nakedQuad'),
  xyWing: findXYWing,
  hiddenQuad: (s) => findHiddenSubset(s, 4, 'hiddenQuad'),
  xyzWing: findXYZWing,
  wWing: findWWing,
  swordfish: (s) => findFish(s, 3, 'swordfish'),
  simpleColoring: findSimpleColoring,
  jellyfish: (s) => findFish(s, 4, 'jellyfish'),
  xyChain: (s) => findXYChain(s),
};

export function findWith(s: LogicState, technique: TechniqueId): Step | null {
  return FINDERS[technique](s);
}

/** The simplest available deduction, or null if the solver is stuck. */
export function findNextStep(s: LogicState, allowed?: ReadonlySet<TechniqueId>): Step | null {
  for (const t of TECHNIQUES) {
    if (allowed && !allowed.has(t.id)) continue;
    const step = FINDERS[t.id](s);
    if (step) return step;
  }
  return null;
}

/** Count of cells that could be filled right now by any single. */
export function countAvailableSingles(s: LogicState): number {
  const cells = new Set<number>();
  for (let i = 0; i < 81; i++) if (!s.values[i] && POPCOUNT[s.cands[i]!] === 1) cells.add(i);
  for (const u of ALL_UNITS) {
    for (let d = 1; d <= 9; d++) {
      const b = bit(d);
      let count = 0;
      let pos = -1;
      for (const i of UNITS[u]!) if (s.cands[i]! & b) {
        count++;
        pos = i;
      }
      if (count === 1) cells.add(pos);
    }
  }
  return cells.size;
}

export interface LogicResult {
  solved: boolean;
  steps: Step[];
  state: LogicState;
}

export function solveLogically(grid: ArrayLike<number>, opts: { maxSteps?: number; allowed?: ReadonlySet<TechniqueId> } = {}): LogicResult {
  const state = createState(grid);
  const steps: Step[] = [];
  const maxSteps = opts.maxSteps ?? 2000;
  while (!isComplete(state) && steps.length < maxSteps) {
    const step = findNextStep(state, opts.allowed);
    if (!step) break;
    applyStep(state, step);
    steps.push(step);
  }
  return { solved: isComplete(state), steps, state };
}
