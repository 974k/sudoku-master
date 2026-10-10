// Board geometry and bitmask helpers shared by every part of the engine.
//
// Cells are indexed 0..80 in row-major order. Candidate sets are 9-bit masks
// where bit (d - 1) means "digit d is still possible".

export type Grid = Uint8Array; // length 81, 0 = empty

export const ALL_DIGITS = 0x1ff;

export const ROW_OF = new Uint8Array(81);
export const COL_OF = new Uint8Array(81);
export const BOX_OF = new Uint8Array(81);

/** 27 units: rows 0-8, columns 9-17, boxes 18-26. */
export const UNITS: readonly (readonly number[])[] = (() => {
  const units: number[][] = Array.from({ length: 27 }, () => []);
  for (let i = 0; i < 81; i++) {
    const r = Math.floor(i / 9);
    const c = i % 9;
    const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
    ROW_OF[i] = r;
    COL_OF[i] = c;
    BOX_OF[i] = b;
    units[r]!.push(i);
    units[9 + c]!.push(i);
    units[18 + b]!.push(i);
  }
  return units;
})();

/** For each cell, the indices of its row, column and box units. */
export const CELL_UNITS: readonly (readonly [number, number, number])[] = Array.from(
  { length: 81 },
  (_, i) => [ROW_OF[i]!, 9 + COL_OF[i]!, 18 + BOX_OF[i]!] as const,
);

/** The 20 cells that share a unit with each cell. */
export const PEERS: readonly (readonly number[])[] = Array.from({ length: 81 }, (_, i) => {
  const set = new Set<number>();
  for (const u of CELL_UNITS[i]!) for (const j of UNITS[u]!) if (j !== i) set.add(j);
  return [...set].sort((a, b) => a - b);
});

const PEER_SET: readonly Set<number>[] = PEERS.map((p) => new Set(p));

export function sees(a: number, b: number): boolean {
  return a !== b && PEER_SET[a]!.has(b);
}

export const POPCOUNT = (() => {
  const t = new Uint8Array(512);
  for (let m = 1; m < 512; m++) t[m] = (m & 1) + t[m >> 1]!;
  return t;
})();

export function bit(d: number): number {
  return 1 << (d - 1);
}

/** Digit for a single-bit mask. */
export function digitOf(mask: number): number {
  return 32 - Math.clz32(mask);
}

export function digitsOf(mask: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= 9; d++) if (mask & (1 << (d - 1))) out.push(d);
  return out;
}

export function maskOf(digits: Iterable<number>): number {
  let m = 0;
  for (const d of digits) m |= bit(d);
  return m;
}

export function parseGrid(s: string): Grid {
  const clean = s.replace(/\s+/g, '');
  if (clean.length !== 81) throw new Error(`Grid must have 81 cells, got ${clean.length}`);
  const g = new Uint8Array(81);
  for (let i = 0; i < 81; i++) {
    const ch = clean[i]!;
    if (ch === '.' || ch === '0') continue;
    const d = ch.charCodeAt(0) - 48;
    if (d < 1 || d > 9) throw new Error(`Invalid character "${ch}" at cell ${i}`);
    g[i] = d;
  }
  return g;
}

export function gridToString(g: ArrayLike<number>): string {
  let s = '';
  for (let i = 0; i < 81; i++) s += String(g[i] ?? 0);
  return s;
}

export function countGivens(g: ArrayLike<number>): number {
  let n = 0;
  for (let i = 0; i < 81; i++) if (g[i]) n++;
  return n;
}

export function cellName(i: number): string {
  return `R${ROW_OF[i]! + 1}C${COL_OF[i]! + 1}`;
}

export type UnitKind = 'row' | 'column' | 'box';

export function unitKind(u: number): UnitKind {
  return u < 9 ? 'row' : u < 18 ? 'column' : 'box';
}

export function unitName(u: number): string {
  return `${unitKind(u)} ${(u % 9) + 1}`;
}

/** True when no digit repeats in any unit (empty cells ignored). */
export function isConsistent(g: ArrayLike<number>): boolean {
  for (const unit of UNITS) {
    let seen = 0;
    for (const i of unit) {
      const d = g[i] ?? 0;
      if (!d) continue;
      const b = bit(d);
      if (seen & b) return false;
      seen |= b;
    }
  }
  return true;
}

/** True for a completely filled, valid grid. */
export function isSolvedGrid(g: ArrayLike<number>): boolean {
  for (let i = 0; i < 81; i++) if (!g[i]) return false;
  return isConsistent(g);
}

/** Candidates of every empty cell given the placed digits. */
export function computeCandidates(g: ArrayLike<number>): Uint16Array {
  const cands = new Uint16Array(81);
  for (let i = 0; i < 81; i++) {
    if (g[i]) continue;
    let used = 0;
    for (const p of PEERS[i]!) {
      const d = g[p] ?? 0;
      if (d) used |= bit(d);
    }
    cands[i] = ALL_DIGITS & ~used;
  }
  return cands;
}

/** Cells in `pool` that see every cell in `targets` (excluding the targets). */
export function commonPeers(targets: readonly number[], pool?: Iterable<number>): number[] {
  const out: number[] = [];
  const candidates = pool ?? PEERS[targets[0]!]!;
  for (const c of candidates) {
    if (targets.includes(c)) continue;
    if (targets.every((t) => sees(c, t))) out.push(c);
  }
  return out;
}
