import { describe, expect, it } from 'vitest';
import { bit, computeCandidates } from '../engine/board.ts';
import { applyStep, createState } from '../engine/logic.ts';
import { loadPuzzle, stagePuzzleRef } from './catalog.ts';
import { Game } from './game.ts';
import { buildHint } from './hints.ts';

function newGame(level: 'beginner' | 'medium' | 'expert' = 'beginner', limit = 0): Game {
  return Game.create(loadPuzzle(stagePuzzleRef(level, 1, 1)), { mistakeLimit: limit });
}

const firstEmpty = (g: Game): number => g.values.findIndex((v) => v === 0);
const wrongDigit = (g: Game, cell: number): number => (g.solution[cell]! % 9) + 1;

describe('game rules', () => {
  it('accepts correct digits and locks them', () => {
    const g = newGame();
    const c = firstEmpty(g);
    expect(g.setValue(c, g.solution[c]!).kind).toBe('placed');
    expect(g.isLocked(c)).toBe(true);
    expect(g.setValue(c, wrongDigit(g, c)).kind).toBe('locked');
    expect(g.erase(c).kind).toBe('locked');
    expect(g.correct).toBe(1);
  });

  it('ignores edits to givens', () => {
    const g = newGame();
    const given = g.givens.findIndex((v) => v !== 0);
    expect(g.setValue(given, wrongDigit(g, given)).kind).toBe('locked');
    expect(g.toggleNote(given, 1).kind).toBe('locked');
    expect(g.values[given]).toBe(g.givens[given]);
  });

  it('counts mistakes and enforces an optional limit', () => {
    const g = newGame('beginner', 3);
    const c = firstEmpty(g);
    const wrongs = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => d !== g.solution[c]);
    expect(g.setValue(c, wrongs[0]!).kind).toBe('mistake');
    expect(g.setValue(c, wrongs[1]!).kind).toBe('mistake'); // overwriting a wrong digit is allowed
    expect(g.setValue(c, wrongs[1]!).kind).toBe('none'); // same digit again is not a new mistake
    expect(g.mistakes).toBe(2);
    expect(g.status).toBe('playing');
    g.erase(c);
    const r = g.setValue(c, wrongDigit(g, c));
    expect(r.kind).toBe('mistake');
    expect(r.statusChanged).toBe(true);
    expect(g.status).toBe('lost');
    expect(g.setValue(c, g.solution[c]!).kind).toBe('none');
    g.continueAfterLoss();
    expect(g.status).toBe('playing');
    expect(g.mistakeLimit).toBe(0);
    expect(g.setValue(c, g.solution[c]!).kind).toBe('placed');
  });

  it('has no mistake limit when set to 0', () => {
    const g = newGame('beginner', 0);
    const c = firstEmpty(g);
    for (let k = 0; k < 6; k++) {
      g.erase(c);
      g.setValue(c, wrongDigit(g, c));
    }
    expect(g.mistakes).toBe(6);
    expect(g.status).toBe('playing');
  });

  it('toggles notes and auto-removes them from peers on a correct placement', () => {
    const g = newGame();
    const c = firstEmpty(g);
    const d = g.solution[c]!;
    const peer = g.values.findIndex((v, i) => v === 0 && i !== c && (Math.floor(i / 9) === Math.floor(c / 9)));
    g.toggleNote(peer, d);
    g.toggleNote(peer, d === 9 ? 1 : d + 1);
    expect(g.notes[peer]! & bit(d)).toBeTruthy();
    g.toggleNote(c, 1);
    g.toggleNote(c, 1);
    expect(g.notes[c]).toBe(0);
    g.setValue(c, d, { autoRemoveNotes: true });
    expect(g.notes[peer]! & bit(d)).toBe(0);
    expect(g.notes[peer]).not.toBe(0);
    // undo restores the peer note too
    g.undo();
    expect(g.notes[peer]! & bit(d)).toBeTruthy();
    expect(g.values[c]).toBe(0);
  });

  it('keeps peer notes when auto-remove is off', () => {
    const g = newGame();
    const c = firstEmpty(g);
    const d = g.solution[c]!;
    const peer = g.values.findIndex((v, i) => v === 0 && i !== c && i % 9 === c % 9);
    g.toggleNote(peer, d);
    g.setValue(c, d, { autoRemoveNotes: false });
    expect(g.notes[peer]! & bit(d)).toBeTruthy();
  });

  it('supports undo and redo across values and notes', () => {
    const g = newGame();
    const c = firstEmpty(g);
    g.toggleNote(c, 3);
    g.setValue(c, wrongDigit(g, c));
    g.erase(c);
    expect(g.values[c]).toBe(0);
    g.undo();
    expect(g.values[c]).toBe(wrongDigit(g, c));
    g.undo();
    expect(g.values[c]).toBe(0);
    expect(g.notes[c]).toBe(bit(3));
    g.redo();
    g.redo();
    expect(g.values[c]).toBe(0);
    expect(g.redo()).toBeNull();
    // a new move clears the redo stack
    g.undo();
    g.setValue(c, g.solution[c]!);
    expect(g.future).toHaveLength(0);
    expect(g.mistakes).toBe(1); // undo never refunds mistakes
  });

  it('wins when the board is complete and reports completed units', () => {
    const g = newGame();
    let last = null;
    for (let i = 0; i < 81; i++) if (!g.values[i]) last = g.setValue(i, g.solution[i]!);
    expect(g.status).toBe('won');
    expect(last!.statusChanged).toBe(true);
    expect(last!.completedUnits!.length).toBe(3);
    expect(g.undo()).toBeNull();
  });

  it('fills candidate notes from trusted values and clears them', () => {
    const g = newGame('medium');
    g.fillNotes();
    const cands = computeCandidates(g.givens);
    for (let i = 0; i < 81; i++) if (!g.givens[i]) expect(g.notes[i]).toBe(cands[i]);
    g.clearNotes();
    expect([...g.notes].every((n) => n === 0)).toBe(true);
    g.undo();
    expect(g.notes[firstEmpty(g)]).toBe(cands[firstEmpty(g)]);
  });

  it('restarts cleanly', () => {
    const g = newGame();
    const c = firstEmpty(g);
    g.setValue(c, wrongDigit(g, c));
    g.useHint();
    g.addTime(1000);
    g.restart();
    expect(g.values.join()).toBe(g.givens.join());
    expect([g.mistakes, g.hintsUsed, g.elapsedMs, g.history.length, g.started]).toEqual([0, 0, 0, 0, false]);
  });

  it('caps a single timer tick so a sleeping device cannot inflate the time', () => {
    const g = newGame();
    g.addTime(60_000);
    expect(g.elapsedMs).toBe(5_000);
  });
});

describe('save and restore', () => {
  it('round-trips through a snapshot (JSON)', () => {
    const g = newGame('medium', 5);
    const c = firstEmpty(g);
    g.toggleNote(c, 2);
    g.setValue(firstEmpty(g) === c ? c : c, wrongDigit(g, c));
    g.addTime(4321);
    g.useHint();
    const snap = JSON.parse(JSON.stringify(g.snapshot()));
    const r = Game.restore(g.puzzle, snap)!;
    expect(r).not.toBeNull();
    expect(r.values.join()).toBe(g.values.join());
    expect(r.notes.join()).toBe(g.notes.join());
    expect([r.mistakes, r.hintsUsed, r.elapsedMs, r.mistakeLimit]).toEqual([1, 1, 4321, 5]);
    expect(r.history).toHaveLength(g.history.length);
    r.undo();
    expect(r.values[c]).toBe(0);
  });

  it('rejects snapshots that do not match the puzzle or are corrupted', () => {
    const g = newGame();
    const snap = g.snapshot();
    const other = loadPuzzle(stagePuzzleRef('beginner', 1, 2));
    expect(Game.restore(other, snap)).toBeNull();
    expect(Game.restore(g.puzzle, { ...snap, values: 'xyz' })).toBeNull();
    expect(Game.restore(g.puzzle, { ...snap, notes: [] as number[] })).toBeNull();
    const weird = Game.restore(g.puzzle, { ...snap, history: [[{ cell: 900 }]] as never, mistakes: -4 as number });
    expect(weird!.history).toHaveLength(0);
    expect(weird!.mistakes).toBe(0);
  });
});

describe('hints', () => {
  it('points out mistakes first', () => {
    const g = newGame();
    const c = firstEmpty(g);
    g.setValue(c, wrongDigit(g, c));
    const h = buildHint(g);
    expect(h.kind).toBe('mistake');
    if (h.kind === 'mistake') expect(h.cells).toEqual([c]);
  });

  it('explains a correct next placement for every level', () => {
    for (const level of ['beginner', 'medium', 'expert'] as const) {
      const g = newGame(level);
      const h = buildHint(g);
      expect(h.kind).toBe('logic');
      if (h.kind !== 'logic') continue;
      expect(g.solution[h.placement.cell]).toBe(h.placement.digit);
      for (const s of h.steps) {
        expect(s.explanation.detail.length).toBeGreaterThan(20);
        expect(s.explanation.nudge.length).toBeGreaterThan(5);
        for (const e of s.step.eliminations) expect(g.solution[e.cell]).not.toBe(e.digit);
      }
    }
  });

  it('can solve an entire expert puzzle by following hints, with minimal step chains', () => {
    const g = newGame('expert');
    let guard = 0;
    while (g.status === 'playing' && guard++ < 200) {
      const h = buildHint(g);
      expect(h.kind).toBe('logic');
      if (h.kind !== 'logic') break;
      // replaying the kept steps from the trusted state reproduces a valid single
      const s = createState(g.trustedValues());
      for (const st of h.steps.slice(0, -1)) applyStep(s, st.step);
      expect(s.cands[h.placement.cell]! & bit(h.placement.digit)).toBeTruthy();
      g.setValue(h.placement.cell, h.placement.digit, {}, true);
    }
    expect(g.status).toBe('won');
    expect(g.hinted.size).toBeGreaterThan(40);
    expect(g.correct).toBe(0);
  });
});
