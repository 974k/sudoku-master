// The 9×9 board view. Builds its DOM once and diff-updates classes/text.

import { BOX_OF, COL_OF, ROW_OF, digitsOf } from '../engine/board.ts';
import { h } from './dom.ts';

export type CandMark = 'pattern' | 'elim' | 'place' | 'a' | 'b';

export interface HintOverlay {
  unitCells?: ReadonlySet<number>;
  pattern?: ReadonlySet<number>;
  targets?: ReadonlySet<number>;
  place?: number;
  colorA?: ReadonlySet<number>;
  colorB?: ReadonlySet<number>;
  /** Candidates to show instead of the player's notes (teaching view). */
  cands?: ArrayLike<number>;
  marks?: ReadonlyMap<number, ReadonlyMap<number, CandMark>>;
}

export interface BoardModel {
  values: ArrayLike<number>;
  givens: ArrayLike<number>;
  notes: ArrayLike<number>;
  isWrong: (cell: number) => boolean;
  hinted?: ReadonlySet<number>;
  selected: number | null;
  highlightRegion: boolean;
  highlightSame: boolean;
  overlay?: HintOverlay | null;
  /** Cells to emphasise (tutorial focus). */
  focus?: ReadonlySet<number>;
  dimmed?: boolean;
}

export interface BoardOptions {
  label?: string;
  interactive?: boolean;
  onSelect?: (cell: number) => void;
}

export class BoardView {
  readonly el: HTMLElement;
  private cells: HTMLElement[] = [];
  private valueEls: HTMLElement[] = [];
  private fxEls: HTMLElement[] = [];
  private noteEls: HTMLElement[][] = [];
  private lastClass: string[] = [];
  private lastValue: string[] = [];
  private lastNotes: string[] = [];
  private lastLabel: string[] = [];
  private selected: number | null = null;
  private opts: BoardOptions;

  constructor(opts: BoardOptions = {}) {
    this.opts = opts;
    const interactive = opts.interactive !== false;
    this.el = h('div', {
      class: interactive ? 'board' : 'board static',
      role: 'grid',
      'aria-label': opts.label ?? 'Sudoku board',
      'aria-readonly': interactive ? undefined : 'true',
    });
    for (let r = 0; r < 9; r++) {
      const row = h('div', { class: 'board-row', role: 'row' });
      for (let c = 0; c < 9; c++) {
        const i = r * 9 + c;
        const value = h('span', { class: 'v', 'aria-hidden': 'true' });
        const notes = h('div', { class: 'notes', 'aria-hidden': 'true' });
        const noteSpans: HTMLElement[] = [];
        for (let d = 1; d <= 9; d++) {
          const s = h('span', { class: `n n${d}` });
          noteSpans.push(s);
          notes.appendChild(s);
        }
        const fx = h('span', { class: 'fx', 'aria-hidden': 'true' });
        const cell = h('div', { role: 'gridcell', tabindex: interactive && i === 0 ? '0' : '-1', dataset: { cell: String(i) } }, fx, value, notes);
        if (interactive) {
          // pointerdown for instant response on touch; click for assistive
          // tech and other inputs that only send clicks (selection is idempotent)
          cell.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            opts.onSelect?.(i);
            cell.focus({ preventScroll: true });
          });
          cell.addEventListener('click', () => {
            if (this.selected !== i) opts.onSelect?.(i);
          });
          cell.addEventListener('focus', () => {
            if (this.selected !== i) opts.onSelect?.(i);
          });
        }
        this.cells.push(cell);
        this.valueEls.push(value);
        this.fxEls.push(fx);
        this.noteEls.push(noteSpans);
        this.lastClass.push('');
        this.lastValue.push('');
        this.lastNotes.push('');
        this.lastLabel.push('');
        row.appendChild(cell);
      }
      this.el.appendChild(row);
    }
  }

  render(m: BoardModel): void {
    const sel = m.selected;
    this.selected = sel;
    const selDigit = sel !== null ? m.values[sel] ?? 0 : 0;
    const selWrong = sel !== null && selDigit !== 0 && (m.givens[sel] ?? 0) === 0 && m.isWrong(sel);
    const ov = m.overlay ?? null;
    // while a hint is showing, selection highlights would compete with it
    const region = m.highlightRegion && !ov;
    const same = m.highlightSame && !ov;
    this.el.classList.toggle('dimmed', !!m.dimmed);
    this.el.classList.toggle('teaching', !!ov?.cands);

    for (let i = 0; i < 81; i++) {
      const v = m.values[i] ?? 0;
      const given = (m.givens[i] ?? 0) !== 0;
      const wrong = !given && v !== 0 && m.isWrong(i);
      const cls = ['cell'];
      if (COL_OF[i] === 2 || COL_OF[i] === 5) cls.push('br');
      if (ROW_OF[i] === 2 || ROW_OF[i] === 5) cls.push('bb');
      if (given) cls.push('given');
      else if (v) cls.push(m.hinted?.has(i) ? 'user hinted' : 'user');
      if (wrong) cls.push('wrong');
      if (sel !== null) {
        const peer = i !== sel && (ROW_OF[i] === ROW_OF[sel] || COL_OF[i] === COL_OF[sel] || BOX_OF[i] === BOX_OF[sel]);
        if (i === sel) cls.push('sel');
        else if (region && peer) cls.push('region');
        if (same && selDigit && v === selDigit && i !== sel) cls.push('same');
        // a wrong entry: show which digits it clashes with
        if (selWrong && peer && v === selDigit) cls.push('clash');
      }
      if (ov) {
        if (ov.unitCells?.has(i)) cls.push('h-unit');
        if (ov.pattern?.has(i)) cls.push('h-pattern');
        if (ov.targets?.has(i)) cls.push('h-target');
        if (ov.place === i) cls.push('h-place');
        if (ov.colorA?.has(i)) cls.push('h-a');
        if (ov.colorB?.has(i)) cls.push('h-b');
      }
      if (m.focus?.has(i)) cls.push('focus');
      const className = cls.join(' ');
      const cell = this.cells[i]!;
      if (className !== this.lastClass[i]) {
        cell.className = className;
        this.lastClass[i] = className;
      }
      const vText = v ? String(v) : '';
      if (vText !== this.lastValue[i]) {
        this.valueEls[i]!.textContent = vText;
        this.lastValue[i] = vText;
      }

      // notes (or teaching candidates)
      const showCands = !v && ov?.cands;
      const mask = v ? 0 : showCands ? ov!.cands![i] ?? 0 : m.notes[i] ?? 0;
      const marks = showCands ? ov!.marks?.get(i) : undefined;
      const sig = `${mask}|${marks ? [...marks].join(',') : ''}|${!v && same && selDigit ? selDigit : 0}`;
      if (sig !== this.lastNotes[i]) {
        const spans = this.noteEls[i]!;
        for (let d = 1; d <= 9; d++) {
          const on = (mask >> (d - 1)) & 1;
          const s = spans[d - 1]!;
          s.textContent = on ? String(d) : '';
          const mark = marks?.get(d);
          s.className = `n n${d}${mark ? ` m-${mark}` : ''}${on && same && selDigit === d ? ' match' : ''}`;
        }
        this.lastNotes[i] = sig;
      }

      const label = this.cellLabel(i, v, given, wrong, mask, m.hinted?.has(i) ?? false);
      if (label !== this.lastLabel[i]) {
        cell.setAttribute('aria-label', label);
        this.lastLabel[i] = label;
      }
      if (this.opts.interactive !== false) {
        const tab = (sel ?? 0) === i ? '0' : '-1';
        if (cell.getAttribute('tabindex') !== tab) cell.setAttribute('tabindex', tab);
        cell.setAttribute('aria-selected', String(sel === i));
      }
    }
  }

  private cellLabel(i: number, v: number, given: boolean, wrong: boolean, notes: number, hinted: boolean): string {
    const pos = `Row ${ROW_OF[i]! + 1}, column ${COL_OF[i]! + 1}`;
    if (v) return `${pos}: ${v}${given ? ', given' : wrong ? ', incorrect' : hinted ? ', from hint' : ''}`;
    const n = digitsOf(notes);
    return n.length ? `${pos}: empty, notes ${n.join(' ')}` : `${pos}: empty`;
  }

  /** Move keyboard focus to a cell (only if the board already has focus, unless `force`). */
  focusCell(i: number, force = false): void {
    if (force || this.el.contains(document.activeElement)) this.cells[i]?.focus({ preventScroll: true });
  }

  /** Re-trigger a CSS animation on some cells' effect layer ('fx') or digit ('v'). */
  animate(cells: readonly number[], cls: string, staggerMs = 0, target: 'fx' | 'v' = 'fx'): void {
    if (document.documentElement.dataset.motion === 'reduce') return;
    cells.forEach((c, k) => {
      const el = target === 'fx' ? this.fxEls[c] : this.valueEls[c];
      if (!el) return;
      const run = () => {
        el.classList.remove(cls);
        void el.offsetWidth; // restart the animation
        el.classList.add(cls);
        setTimeout(() => el.classList.remove(cls), 700);
      };
      if (staggerMs) setTimeout(run, k * staggerMs);
      else run();
    });
  }
}
