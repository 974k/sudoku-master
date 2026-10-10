// A single game in progress: board, notes, undo/redo history, mistakes,
// hints and timer. Pure state + rules; no DOM.

import { ALL_DIGITS, CELL_UNITS, PEERS, UNITS, bit, computeCandidates } from '../engine/board.ts';
import type { Puzzle } from './catalog.ts';

export type GameStatus = 'playing' | 'won' | 'lost';

export interface CellChange {
  cell: number;
  /** [before, after] */
  value: [number, number];
  notes: [number, number];
}

export type HistoryEntry = CellChange[];

export type MoveKind = 'none' | 'placed' | 'mistake' | 'erased' | 'note' | 'locked';

export interface MoveResult {
  kind: MoveKind;
  cell?: number;
  /** Units (0-26) completed by this move. */
  completedUnits?: number[];
  /** Digit whose ninth correct copy was just placed. */
  digitCompleted?: number;
  /** Status changed to won/lost on this move. */
  statusChanged?: boolean;
}

export interface GameSnapshot {
  v: 1;
  id: string;
  givens: string;
  values: string;
  notes: number[];
  hinted: number[];
  mistakes: number;
  hintsUsed: number;
  elapsedMs: number;
  correct: number;
  wrong: number;
  history: HistoryEntry[];
  future: HistoryEntry[];
  status: GameStatus;
  started: boolean;
  usedNotes: boolean;
  mistakeLimit: number;
  createdAt: number;
  updatedAt: number;
}

export interface InputOptions {
  autoRemoveNotes?: boolean;
}

const MAX_HISTORY = 500;
const SAVED_HISTORY = 200;

export class Game {
  readonly puzzle: Puzzle;
  readonly givens: Uint8Array;
  readonly solution: Uint8Array;
  values: Uint8Array;
  notes: Uint16Array;
  hinted = new Set<number>();
  mistakes = 0;
  hintsUsed = 0;
  elapsedMs = 0;
  /** Correct / wrong digits entered by the player (for accuracy). */
  correct = 0;
  wrong = 0;
  history: HistoryEntry[] = [];
  future: HistoryEntry[] = [];
  status: GameStatus = 'playing';
  /** Becomes true on the first move, so opening a puzzle isn't counted as playing it. */
  started = false;
  usedNotes = false;
  mistakeLimit: number;
  createdAt = Date.now();
  updatedAt = Date.now();

  private constructor(puzzle: Puzzle, mistakeLimit: number) {
    this.puzzle = puzzle;
    this.givens = Uint8Array.from(puzzle.givens, (ch) => Number(ch));
    this.solution = Uint8Array.from(puzzle.solution, (ch) => Number(ch));
    this.values = this.givens.slice();
    this.notes = new Uint16Array(81);
    this.mistakeLimit = mistakeLimit;
  }

  static create(puzzle: Puzzle, opts: { mistakeLimit: number }): Game {
    return new Game(puzzle, opts.mistakeLimit);
  }

  /** Rebuild a saved game. Returns null if the snapshot doesn't fit the puzzle. */
  static restore(puzzle: Puzzle, s: GameSnapshot): Game | null {
    try {
      if (s.v !== 1 || s.id !== puzzle.id || s.givens !== puzzle.givens) return null;
      if (typeof s.values !== 'string' || s.values.length !== 81 || !Array.isArray(s.notes) || s.notes.length !== 81) return null;
      const g = new Game(puzzle, num(s.mistakeLimit));
      for (let i = 0; i < 81; i++) {
        const d = Number(s.values[i]);
        if (!(d >= 0 && d <= 9)) return null;
        if (g.givens[i]) continue;
        g.values[i] = d;
        g.notes[i] = num(s.notes[i]) & ALL_DIGITS;
      }
      g.hinted = new Set((s.hinted ?? []).filter((c) => Number.isInteger(c) && c >= 0 && c < 81));
      g.mistakes = num(s.mistakes);
      g.hintsUsed = num(s.hintsUsed);
      g.elapsedMs = num(s.elapsedMs);
      g.correct = num(s.correct);
      g.wrong = num(s.wrong);
      g.history = validHistory(s.history);
      g.future = validHistory(s.future);
      g.status = s.status === 'won' || s.status === 'lost' ? s.status : 'playing';
      g.started = Boolean(s.started);
      g.usedNotes = Boolean(s.usedNotes);
      g.createdAt = num(s.createdAt) || Date.now();
      g.updatedAt = num(s.updatedAt) || Date.now();
      if (g.status === 'playing' && g.isSolved()) g.status = 'won';
      return g;
    } catch {
      return null;
    }
  }

  snapshot(): GameSnapshot {
    const values = Array.from(this.values, (d, i) => (this.givens[i] ? 0 : d)).join('');
    return {
      v: 1,
      id: this.puzzle.id,
      givens: this.puzzle.givens,
      values,
      notes: Array.from(this.notes),
      hinted: [...this.hinted],
      mistakes: this.mistakes,
      hintsUsed: this.hintsUsed,
      elapsedMs: Math.round(this.elapsedMs),
      correct: this.correct,
      wrong: this.wrong,
      history: this.history.slice(-SAVED_HISTORY),
      future: this.future.slice(-SAVED_HISTORY),
      status: this.status,
      started: this.started,
      usedNotes: this.usedNotes,
      mistakeLimit: this.mistakeLimit,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  // -------------------------------------------------------------------------
  // queries

  isGiven(i: number): boolean {
    return this.givens[i] !== 0;
  }

  isWrong(i: number): boolean {
    return this.values[i] !== 0 && this.values[i] !== this.solution[i];
  }

  /** Givens and correct entries can't be changed (except by undo). */
  isLocked(i: number): boolean {
    return this.values[i] !== 0 && this.values[i] === this.solution[i];
  }

  isSolved(): boolean {
    for (let i = 0; i < 81; i++) if (this.values[i] !== this.solution[i]) return false;
    return true;
  }

  get playing(): boolean {
    return this.status === 'playing';
  }

  /** Correct copies of digit d still to be placed. */
  remaining(d: number): number {
    let n = 0;
    for (let i = 0; i < 81; i++) if (this.values[i] === d && this.solution[i] === d) n++;
    return 9 - n;
  }

  filledCount(): number {
    let n = 0;
    for (let i = 0; i < 81; i++) if (this.values[i] && this.values[i] === this.solution[i]) n++;
    return n;
  }

  /** Values that are correct or given — the information the player has earned. */
  trustedValues(): Uint8Array {
    return Uint8Array.from(this.values, (d, i) => (d === this.solution[i] ? d : 0));
  }

  // -------------------------------------------------------------------------
  // moves

  input(cell: number, digit: number, notesMode: boolean, opts: InputOptions = {}): MoveResult {
    return notesMode ? this.toggleNote(cell, digit) : this.setValue(cell, digit, opts);
  }

  setValue(cell: number, digit: number, opts: InputOptions = {}, fromHint = false): MoveResult {
    if (!this.playing || digit < 1 || digit > 9) return { kind: 'none' };
    if (this.isLocked(cell)) return { kind: 'locked', cell };
    if (this.values[cell] === digit) return { kind: 'none', cell };

    const changes: CellChange[] = [];
    const correct = digit === this.solution[cell];
    changes.push({ cell, value: [this.values[cell]!, digit], notes: [this.notes[cell]!, 0] });
    if (correct && opts.autoRemoveNotes !== false) {
      const b = bit(digit);
      for (const p of PEERS[cell]!) {
        if (this.values[p] || !(this.notes[p]! & b)) continue;
        changes.push({ cell: p, value: [0, 0], notes: [this.notes[p]!, this.notes[p]! & ~b] });
      }
    }
    this.commit(changes);

    if (fromHint) this.hinted.add(cell);
    else if (correct) this.correct++;
    else this.wrong++;

    if (!correct) {
      this.mistakes++;
      if (this.mistakeLimit > 0 && this.mistakes >= this.mistakeLimit) {
        this.status = 'lost';
        return { kind: 'mistake', cell, statusChanged: true };
      }
      return { kind: 'mistake', cell };
    }

    const result: MoveResult = { kind: 'placed', cell, completedUnits: this.completedUnitsAt(cell) };
    if (this.remaining(digit) === 0) result.digitCompleted = digit;
    if (this.isSolved()) {
      this.status = 'won';
      result.statusChanged = true;
    }
    return result;
  }

  toggleNote(cell: number, digit: number): MoveResult {
    if (!this.playing || digit < 1 || digit > 9) return { kind: 'none' };
    if (this.isLocked(cell)) return { kind: 'locked', cell };
    const changes: CellChange[] = [];
    const before = this.notes[cell]!;
    // Writing a note into a cell that holds a wrong digit clears the digit.
    changes.push({ cell, value: [this.values[cell]!, 0], notes: [before, before ^ bit(digit)] });
    this.commit(changes);
    this.usedNotes = true;
    return { kind: 'note', cell };
  }

  erase(cell: number): MoveResult {
    if (!this.playing) return { kind: 'none' };
    if (this.isLocked(cell)) return { kind: 'locked', cell };
    if (!this.values[cell] && !this.notes[cell]) return { kind: 'none', cell };
    this.commit([{ cell, value: [this.values[cell]!, 0], notes: [this.notes[cell]!, 0] }]);
    return { kind: 'erased', cell };
  }

  /** Fill every empty cell's notes with its candidates (based on trusted values). */
  fillNotes(): number {
    if (!this.playing) return 0;
    const cands = computeCandidates(this.trustedValues());
    const changes: CellChange[] = [];
    for (let i = 0; i < 81; i++) {
      if (this.values[i] || this.notes[i] === cands[i]) continue;
      changes.push({ cell: i, value: [0, 0], notes: [this.notes[i]!, cands[i]!] });
    }
    if (changes.length) {
      this.commit(changes);
      this.usedNotes = true;
    }
    return changes.length;
  }

  clearNotes(): number {
    if (!this.playing) return 0;
    const changes: CellChange[] = [];
    for (let i = 0; i < 81; i++) if (this.notes[i]) changes.push({ cell: i, value: [this.values[i]!, this.values[i]!], notes: [this.notes[i]!, 0] });
    if (changes.length) this.commit(changes);
    return changes.length;
  }

  /** Remove specific candidates from the player's notes (used when a hint explains eliminations). */
  removeNotes(elims: readonly { cell: number; digit: number }[]): number {
    if (!this.playing) return 0;
    const next = new Map<number, number>();
    for (const e of elims) {
      if (this.values[e.cell]) continue;
      const cur = next.get(e.cell) ?? this.notes[e.cell]!;
      if (cur & bit(e.digit)) next.set(e.cell, cur & ~bit(e.digit));
    }
    const changes: CellChange[] = [];
    for (const [cell, notes] of next) changes.push({ cell, value: [0, 0], notes: [this.notes[cell]!, notes] });
    if (changes.length) this.commit(changes);
    return changes.length;
  }

  useHint(): void {
    if (!this.playing) return;
    this.hintsUsed++;
    this.started = true;
    this.touch();
  }

  undo(): number[] | null {
    if (!this.playing) return null;
    const entry = this.history.pop();
    if (!entry) return null;
    for (const ch of entry) {
      this.values[ch.cell] = ch.value[0];
      this.notes[ch.cell] = ch.notes[0];
      if (!ch.value[0]) this.hinted.delete(ch.cell);
    }
    this.future.push(entry);
    this.touch();
    return entry.map((c) => c.cell);
  }

  redo(): number[] | null {
    if (!this.playing) return null;
    const entry = this.future.pop();
    if (!entry) return null;
    for (const ch of entry) {
      this.values[ch.cell] = ch.value[1];
      this.notes[ch.cell] = ch.notes[1];
    }
    this.history.push(entry);
    this.touch();
    if (this.isSolved()) this.status = 'won';
    return entry.map((c) => c.cell);
  }

  /** Clear the board back to the givens and reset all counters. */
  restart(mistakeLimit = this.mistakeLimit): void {
    this.values = this.givens.slice();
    this.notes = new Uint16Array(81);
    this.hinted.clear();
    this.mistakes = 0;
    this.hintsUsed = 0;
    this.elapsedMs = 0;
    this.correct = 0;
    this.wrong = 0;
    this.history = [];
    this.future = [];
    this.status = 'playing';
    this.started = false;
    this.usedNotes = false;
    this.mistakeLimit = mistakeLimit;
    this.createdAt = Date.now();
    this.touch();
  }

  /** After hitting the mistake limit: keep playing with no limit. */
  continueAfterLoss(): void {
    if (this.status !== 'lost') return;
    this.status = 'playing';
    this.mistakeLimit = 0;
    this.touch();
  }

  addTime(ms: number): void {
    if (this.playing && ms > 0) this.elapsedMs += Math.min(ms, 5_000);
  }

  // -------------------------------------------------------------------------

  private commit(changes: CellChange[]): void {
    for (const ch of changes) {
      this.values[ch.cell] = ch.value[1];
      this.notes[ch.cell] = ch.notes[1];
    }
    this.history.push(changes);
    if (this.history.length > MAX_HISTORY) this.history.splice(0, this.history.length - MAX_HISTORY);
    this.future = [];
    this.started = true;
    this.touch();
  }

  private touch(): void {
    this.updatedAt = Date.now();
  }

  private completedUnitsAt(cell: number): number[] {
    return CELL_UNITS[cell]!.filter((u) => UNITS[u]!.every((i) => this.values[i] === this.solution[i]));
  }
}

function num(x: unknown): number {
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function validHistory(h: unknown): HistoryEntry[] {
  if (!Array.isArray(h)) return [];
  const ok = (ch: unknown): ch is CellChange => {
    const c = ch as CellChange;
    return (
      !!c &&
      Number.isInteger(c.cell) &&
      c.cell >= 0 &&
      c.cell < 81 &&
      Array.isArray(c.value) &&
      Array.isArray(c.notes) &&
      c.value.every((v) => Number.isInteger(v) && v >= 0 && v <= 9) &&
      c.notes.every((v) => Number.isInteger(v) && v >= 0 && v <= ALL_DIGITS)
    );
  };
  return h.filter((e): e is HistoryEntry => Array.isArray(e) && e.length > 0 && e.every(ok));
}
