import { COL_OF, ROW_OF, UNITS, computeCandidates, digitsOf } from '../../engine/board.ts';
import { friendlyCell, seenDigits } from '../../engine/explain.ts';
import { applyStep, cloneState, createState, type LogicState, type Step } from '../../engine/logic.ts';
import { LEVEL_INFO, refFromId, type PuzzleRef } from '../../game/catalog.ts';
import type { MoveResult } from '../../game/game.ts';
import { buildHint, type Hint } from '../../game/hints.ts';
import { currentStreak, nextPuzzle } from '../../game/profile.ts';
import type { WinReport } from '../../game/store.ts';
import type { ScreenFactory } from '../app.ts';
import { BoardView, type HintOverlay } from '../board.ts';
import { nudgeOverlay, stepOverlay } from '../overlay.ts';
import { actionSheet, announce, confirmDialog, iconButton, stars, toast } from '../components.ts';
import { formatTime, h, plural } from '../dom.ts';
import { icon } from '../icons.ts';
import { puzzleTitle } from './home.ts';

interface HintSession {
  hint: Hint;
  /** 0 = nudge, 1 = full explanation */
  level: 0 | 1;
  step: number;
  /** Logic state before each step, for drawing candidates. */
  states: LogicState[];
}

function backTarget(ref: PuzzleRef): string {
  if (ref.kind === 'daily') return '/daily';
  if (ref.kind === 'ai') return '/ai';
  return `/level/${ref.level}/${ref.stage}`;
}

export const playScreen: ScreenFactory = (ctx, [id], query) => {
  const ref = refFromId(id ?? '');
  if (!ref) throw new Error('unknown puzzle');
  const { store, feedback } = ctx;
  // locked puzzles (and future dailies) can't be opened, even by typing the address
  if (!store.canPlay(ref)) throw new Error('locked');

  const game = store.openGame(ref);
  const S = () => store.settings;
  let selected: number | null = null;
  let notesMode = false;
  let paused = false;
  let session: HintSession | null = null;
  let overlay: HTMLElement | null = null;
  let finished = game.status === 'won';
  /** Whether this game's start has been counted in the statistics. */
  let startedRecorded = game.started;

  // ---------------------------------------------------------------- layout
  const board = new BoardView({ label: `Sudoku board, ${puzzleTitle(ref)}`, onSelect: (i) => select(i) });
  const timerEl = h('span', { class: 'timer', 'aria-label': 'Time' });
  const mistakesEl = h('span', { class: 'mistakes' });
  const pauseBtn = iconButton('pause', 'Pause', () => setPaused(true));
  const statusBar = h(
    'div',
    { class: 'statusbar' },
    h('span', { class: `level-chip lvl-${ref.level}`, text: ref.kind === 'daily' ? `Daily · ${LEVEL_INFO[ref.level].name}` : ref.kind === 'ai' ? `AI · ${LEVEL_INFO[ref.level].name}` : LEVEL_INFO[ref.level].name }),
    mistakesEl,
    h('span', { class: 'timer-wrap' }, icon('clock'), timerEl),
  );
  const learnStrip = h('div', { class: 'learn-strip', 'aria-live': 'polite' });

  const toolBtn = (ic: Parameters<typeof icon>[0], label: string, onClick: () => void, extra?: HTMLElement) =>
    h('button', { type: 'button', class: 'tool', onClick, 'aria-label': label }, icon(ic), h('span', { class: 'tool-label', text: label }), extra ?? null);
  const notesBadge = h('span', { class: 'tool-badge', text: 'Off' });
  const undoBtn = toolBtn('undo', 'Undo', () => doUndo());
  const redoBtn = toolBtn('redo', 'Redo', () => doRedo());
  const eraseBtn = toolBtn('eraser', 'Erase', () => doErase());
  const notesBtn = toolBtn('pencil', 'Notes', () => toggleNotes(), notesBadge);
  const hintCount = h('span', { class: 'tool-badge count' });
  const hintBtn = toolBtn('bulb', 'Hint', () => openHint(), hintCount);
  const tools = h('div', { class: 'tools', role: 'toolbar', 'aria-label': 'Tools' }, undoBtn, redoBtn, eraseBtn, notesBtn, hintBtn);

  const padButtons: HTMLButtonElement[] = [];
  const pad = h('div', { class: 'numpad', role: 'group', 'aria-label': 'Number pad' });
  for (let d = 1; d <= 9; d++) {
    const count = h('small', { class: 'pad-count' });
    const b = h('button', { type: 'button', class: 'pad-btn', onClick: () => input(d) }, h('span', { class: 'pad-digit', text: String(d) }), count);
    padButtons.push(b);
    pad.appendChild(b);
  }
  const hintPanel = h('section', { class: 'hint-panel', 'aria-live': 'polite', hidden: true });
  const controls = h('div', { class: 'controls' }, tools, pad, hintPanel);

  const el = h(
    'main',
    { class: 'screen play' },
    h(
      'header',
      { class: 'topbar play-top' },
      h('div', { class: 'topbar-side' }, iconButton('back', 'Back', () => leave())),
      h('div', { class: 'topbar-title' }, h('h1', { text: ref.kind === 'daily' ? 'Daily Challenge' : ref.kind === 'ai' ? 'Sudoku AI' : `Stage ${ref.stage} · Puzzle ${ref.number}` }), h('p', { class: 'topbar-sub', text: ref.kind === 'daily' ? new Date(`${ref.date}T12:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) : LEVEL_INFO[ref.level].name })),
      h('div', { class: 'topbar-side end' }, pauseBtn, iconButton('more', 'Game menu', () => openMenu())),
    ),
    h('div', { class: 'play-body' }, h('div', { class: 'board-col' }, statusBar, h('div', { class: 'board-wrap' }, board.el), learnStrip), controls),
  );

  // ---------------------------------------------------------------- render
  function render(): void {
    const s = S();
    board.render({
      values: game.values,
      givens: game.givens,
      notes: game.notes,
      isWrong: (i) => game.isWrong(i),
      hinted: game.hinted,
      selected: paused ? null : selected,
      highlightRegion: s.highlightRegion,
      highlightSame: s.highlightSameNumbers,
      overlay: hintOverlay(),
      dimmed: paused,
    });
    for (let d = 1; d <= 9; d++) {
      const rem = game.remaining(d);
      const b = padButtons[d - 1]!;
      b.disabled = rem === 0 || !game.playing;
      (b.lastChild as HTMLElement).textContent = s.showRemaining && rem > 0 ? String(rem) : '';
      b.setAttribute('aria-label', rem === 0 ? `${d}, all placed` : notesMode ? `Note ${d}` : `${d}${s.showRemaining ? `, ${rem} left` : ''}`);
    }
    pad.classList.toggle('notes-mode', notesMode);
    notesBtn.classList.toggle('on', notesMode);
    notesBtn.setAttribute('aria-pressed', String(notesMode));
    notesBadge.textContent = notesMode ? 'On' : 'Off';
    undoBtn.disabled = !game.history.length || !game.playing;
    redoBtn.disabled = !game.future.length || !game.playing;
    eraseBtn.disabled = selected === null || !game.playing;
    hintBtn.hidden = !s.hints;
    hintCount.textContent = game.hintsUsed ? String(game.hintsUsed) : '';
    hintCount.hidden = !game.hintsUsed;
    mistakesEl.textContent = game.mistakeLimit > 0 ? `Mistakes ${game.mistakes}/${game.mistakeLimit}` : `Mistakes ${game.mistakes}`;
    mistakesEl.classList.toggle('bad', game.mistakes > 0);
    statusBar.classList.toggle('no-timer', !s.showTimer);
    el.classList.toggle('learning', s.learningMode);
    updateTimer();
    renderLearnStrip();
    renderHintPanel();
  }

  function updateTimer(): void {
    timerEl.textContent = formatTime(game.elapsedMs);
  }

  function renderLearnStrip(): void {
    const s = S();
    learnStrip.hidden = !s.learningMode;
    if (!s.learningMode) return;
    learnStrip.replaceChildren();
    if (selected === null) {
      learnStrip.append(h('span', { class: 'muted', text: 'Learning mode: select a cell to see which digits fit and why.' }));
      return;
    }
    const i = selected;
    const where = `R${ROW_OF[i]! + 1}C${COL_OF[i]! + 1}`;
    if (game.isGiven(i)) learnStrip.append(h('strong', { text: where }), ` is a given clue.`);
    else if (game.isLocked(i)) learnStrip.append(h('strong', { text: where }), ` is solved correctly.`);
    else {
      const trusted = game.trustedValues();
      const cands = digitsOf(computeCandidates(trusted)[i]!);
      const seen = seenDigits(trusted, i);
      const parts: string[] = [];
      if (seen.row.length) parts.push(`row has ${seen.row.join(' ')}`);
      if (seen.col.length) parts.push(`column has ${seen.col.join(' ')}`);
      if (seen.box.length) parts.push(`box has ${seen.box.join(' ')}`);
      learnStrip.append(
        h('strong', { text: where }),
        game.isWrong(i) ? h('span', { class: 'bad', text: ` ${game.values[i]} is not right here. ` }) : ' ',
        'Could be ',
        h('strong', { class: 'cands', text: cands.join(' ') || '—' }),
        cands.length === 1 ? ' (only one option!)' : '',
        parts.length ? h('span', { class: 'muted', text: ` · ${parts.join(' · ')}` }) : '',
      );
    }
  }

  // ---------------------------------------------------------------- input
  function canPlay(): boolean {
    return game.playing && !paused && !overlay;
  }

  function select(i: number): void {
    if (paused || overlay) return;
    selected = i;
    if (session && session.hint.kind !== 'logic') session = null;
    render();
  }

  function input(d: number): void {
    if (!canPlay()) return;
    if (selected === null) {
      announce('Select a cell first');
      toast('Select a cell first', { ms: 1500 });
      return;
    }
    applyMove(game.input(selected, d, notesMode, { autoRemoveNotes: S().autoRemoveNotes }));
  }

  function applyMove(r: MoveResult, fromHint = false): void {
    if (r.kind === 'none') return;
    const wasStarted = startedRecorded;
    if (!wasStarted && game.started) {
      startedRecorded = true;
      store.gameStarted(ref!);
    }
    session = null;
    const cell = r.cell ?? selected ?? 0;
    switch (r.kind) {
      case 'placed':
        if (!fromHint) store.entryMade(true);
        feedback.play(r.completedUnits?.length ? 'unit' : 'place');
        announce(`${game.values[cell]} placed at row ${ROW_OF[cell]! + 1}, column ${COL_OF[cell]! + 1}${r.completedUnits?.length ? '. Completed!' : ''}`);
        break;
      case 'mistake':
        store.entryMade(false);
        feedback.play('mistake');
        announce(`${game.values[cell]} is incorrect. Mistakes: ${game.mistakes}`);
        break;
      case 'note':
        feedback.play('note');
        break;
      case 'erased':
        feedback.play('tap');
        break;
      case 'locked':
        announce('That cell is already solved');
        board.animate([cell], 'nudge', 0, 'v');
        return;
    }
    store.saveGame(game);
    render();
    if (r.kind === 'placed') {
      board.animate([cell], 'pop', 0, 'v');
      for (const u of r.completedUnits ?? []) board.animate(orderFrom(cell, UNITS[u]!), 'flash', 35);
      if (r.digitCompleted) padButtons[r.digitCompleted - 1]?.classList.add('done-flash');
    }
    if (r.kind === 'mistake') {
      board.animate([cell], 'shake', 0, 'v');
      mistakesEl.classList.remove('pulse');
      void mistakesEl.offsetWidth;
      mistakesEl.classList.add('pulse');
    }
    if (r.statusChanged && game.status === 'won') win();
    if (r.statusChanged && game.status === 'lost') showLost();
  }
  function doUndo(): void {
    if (!canPlay()) return;
    const cells = game.undo();
    if (!cells) return;
    session = null;
    feedback.play('tap');
    if (cells.length === 1) selected = cells[0]!;
    store.saveGame(game);
    render();
    announce('Undone');
  }

  function doRedo(): void {
    if (!canPlay()) return;
    const cells = game.redo();
    if (!cells) return;
    session = null;
    feedback.play('tap');
    if (cells.length === 1) selected = cells[0]!;
    store.saveGame(game);
    render();
    announce('Redone');
    if (game.status === 'won') win();
  }

  function doErase(): void {
    if (!canPlay() || selected === null) return;
    applyMove(game.erase(selected));
  }

  function toggleNotes(): void {
    if (!canPlay()) return;
    notesMode = !notesMode;
    feedback.play('tap');
    announce(notesMode ? 'Notes mode on' : 'Notes mode off');
    render();
  }

  // ---------------------------------------------------------------- hints
  function openHint(): void {
    if (!canPlay() || !S().hints) return;
    if (session) {
      // pressing Hint again steps deeper
      if (session.level === 0) session.level = 1;
      else if (session.hint.kind === 'logic' && session.step < session.hint.steps.length - 1) session.step++;
      render();
      return;
    }
    const hint = buildHint(game, selected ?? undefined);
    if (hint.kind === 'solved') return;
    const states: LogicState[] = [];
    if (hint.kind === 'logic') {
      const s = createState(game.trustedValues());
      for (const st of hint.steps) {
        states.push(cloneState(s));
        applyStep(s, st.step);
      }
    }
    session = { hint, level: S().learningMode || hint.kind !== 'logic' ? 1 : 0, step: 0, states };
    game.useHint();
    store.hintUsed();
    store.saveGame(game);
    if (!startedRecorded && game.started) {
      startedRecorded = true;
      store.gameStarted(ref!);
    }
    feedback.play('hint');
    render();
  }

  function closeHint(): void {
    session = null;
    render();
  }

  function currentStep(): { step: Step; state: LogicState; index: number; total: number } | null {
    if (!session || session.hint.kind !== 'logic') return null;
    const { steps } = session.hint;
    return { step: steps[session.step]!.step, state: session.states[session.step]!, index: session.step, total: steps.length };
  }

  function hintOverlay(): HintOverlay | null {
    if (!session) return null;
    const { hint } = session;
    if (hint.kind === 'mistake') return { targets: new Set(hint.cells) };
    if (hint.kind === 'reveal') return { place: hint.placement.cell };
    const { step, state } = currentStep()!;
    return session.level === 0 ? nudgeOverlay(step) : stepOverlay(step, state);
  }

  function renderHintPanel(): void {
    const active = !!session && !paused && !overlay;
    hintPanel.hidden = !active;
    tools.hidden = active;
    pad.hidden = active;
    if (!active || !session) return;
    const { hint } = session;
    if (hint.kind === 'solved') return;
    const actions = h('div', { class: 'hint-actions' });
    const body = h('div', { class: 'hint-body' });
    let title = 'Hint';

    if (hint.kind === 'mistake') {
      title = hint.cells.length === 1 ? 'There is a mistake' : 'There are mistakes';
      body.append(h('p', { text: `The highlighted ${hint.cells.length === 1 ? 'cell is' : `${hint.cells.length} cells are`} not correct. Fix ${hint.cells.length === 1 ? 'it' : 'them'} before looking for the next step.` }));
      actions.append(
        h('button', { type: 'button', class: 'btn ghost', text: 'Close', onClick: closeHint }),
        h('button', {
          type: 'button',
          class: 'btn primary',
          text: hint.cells.length === 1 ? 'Erase it' : 'Erase them',
          onClick: () => {
            for (const c of hint.cells) game.erase(c);
            store.saveGame(game);
            closeHint();
          },
        }),
      );
    } else if (hint.kind === 'reveal') {
      title = 'Reveal';
      body.append(h('p', { text: `This position is beyond the step-by-step guide. The answer for ${friendlyCell(hint.placement.cell)} is ${hint.placement.digit}.` }));
      actions.append(
        h('button', { type: 'button', class: 'btn ghost', text: 'Close', onClick: closeHint }),
        h('button', { type: 'button', class: 'btn primary', text: `Place ${hint.placement.digit}`, onClick: () => placeFromHint(hint.placement.cell, hint.placement.digit) }),
      );
    } else {
      const { steps } = hint;
      const cur = steps[session.step]!;
      const isLast = session.step === steps.length - 1;
      title = session.level === 0 ? 'Hint' : cur.explanation.title;
      if (session.level === 0) {
        body.append(h('p', { text: cur.explanation.nudge }));
        if (steps.length > 1) body.append(h('p', { class: 'muted', text: `It takes ${steps.length - 1} ${steps.length === 2 ? 'deduction' : 'deductions'} before a digit can be placed.` }));
        actions.append(
          h('button', { type: 'button', class: 'btn ghost', text: 'Got it', onClick: closeHint }),
          h('button', { type: 'button', class: 'btn primary', text: 'Explain', onClick: () => ((session!.level = 1), render()) }),
        );
      } else {
        if (steps.length > 1) body.append(h('p', { class: 'step-count', text: `Step ${session.step + 1} of ${steps.length}` }));
        body.append(h('p', { text: cur.explanation.detail }));
        if (cur.step.eliminations.length) body.append(legend());
        const placement = hint.placement;
        actions.append(h('button', { type: 'button', class: 'btn ghost', text: 'Close', onClick: closeHint }));
        if (session.step > 0) actions.append(h('button', { type: 'button', class: 'btn ghost', text: 'Back', onClick: () => (session!.step--, render()) }));
        if (!isLast) {
          actions.append(
            h('button', {
              type: 'button',
              class: 'btn primary',
              text: 'Next step',
              onClick: () => {
                // keep the player's notes in sync with what was just deduced
                if (game.removeNotes(cur.step.eliminations)) store.saveGame(game);
                session!.step++;
                render();
              },
            }),
          );
        } else {
          actions.append(h('button', { type: 'button', class: 'btn primary', text: `Place ${placement.digit}`, onClick: () => placeFromHint(placement.cell, placement.digit) }));
        }
      }
    }
    hintPanel.replaceChildren(h('div', { class: 'hint-head' }, icon('bulb'), h('h2', { text: title })), body, actions);
  }

  function legend(): HTMLElement {
    return h(
      'p',
      { class: 'legend' },
      h('span', { class: 'lg pattern', text: '1' }),
      ' pattern ',
      h('span', { class: 'lg elim', text: '1' }),
      ' removed',
    );
  }

  function placeFromHint(cell: number, digit: number): void {
    session = null;
    selected = cell;
    applyMove(game.setValue(cell, digit, { autoRemoveNotes: S().autoRemoveNotes }, true), true);
  }

  // ---------------------------------------------------------------- overlays
  function setOverlay(node: HTMLElement | null): void {
    overlay?.remove();
    overlay = node;
    if (node) {
      el.appendChild(node);
      node.querySelector<HTMLElement>('.btn.primary, button')?.focus({ preventScroll: true });
    }
    render();
  }

  function setPaused(p: boolean): void {
    if (!game.playing || finished) return;
    if (p === paused) return;
    paused = p;
    pauseBtn.replaceChildren(icon(p ? 'play' : 'pause'));
    pauseBtn.setAttribute('aria-label', p ? 'Resume' : 'Pause');
    store.saveGame(game);
    if (p) {
      setOverlay(
        h(
          'div',
          { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Paused' },
          h(
            'div',
            { class: 'overlay-card' },
            h('h2', { text: 'Paused' }),
            h('p', { class: 'big-time', text: formatTime(game.elapsedMs) }),
            h('p', { class: 'muted', text: `${puzzleTitle(ref!)} · ${plural(game.mistakes, 'mistake')}` }),
            h('button', { type: 'button', class: 'btn primary block', onClick: () => setPaused(false) }, icon('play'), 'Resume'),
            h('button', { type: 'button', class: 'btn ghost block', onClick: () => restart() }, icon('restart'), 'Restart'),
            h('button', { type: 'button', class: 'btn ghost block', onClick: () => leave() }, icon('home'), 'Save & quit'),
          ),
        ),
      );
    } else {
      setOverlay(null);
    }
  }

  async function restart(): Promise<void> {
    const ok = await confirmDialog({ title: 'Restart puzzle?', message: 'Your entries, notes and time on this puzzle will be cleared.', confirm: 'Restart', danger: true });
    if (!ok) return;
    game.restart(S().mistakeLimit);
    startedRecorded = false;
    finished = false;
    selected = null;
    session = null;
    paused = false;
    pauseBtn.replaceChildren(icon('pause'));
    store.saveGame(game);
    setOverlay(null);
    announce('Puzzle restarted');
  }

  function showLost(): void {
    setOverlay(
      h(
        'div',
        { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Mistake limit reached' },
        h(
          'div',
          { class: 'overlay-card' },
          h('div', { class: 'overlay-icon bad' }, icon('close')),
          h('h2', { text: 'Mistake limit reached' }),
          h('p', { class: 'muted', text: `You made ${game.mistakes} mistakes. Keep going without a limit, or start over.` }),
          h(
            'button',
            {
              type: 'button',
              class: 'btn primary block',
              onClick: () => {
                game.continueAfterLoss();
                store.saveGame(game);
                setOverlay(null);
              },
            },
            icon('play'),
            'Keep playing',
          ),
          h('button', { type: 'button', class: 'btn ghost block', onClick: () => restart() }, icon('restart'), 'Restart'),
          h('button', { type: 'button', class: 'btn ghost block', onClick: () => leave() }, icon('home'), 'Quit'),
        ),
      ),
    );
  }

  function win(): void {
    if (finished) return;
    finished = true;
    session = null;
    const report = store.gameWon(game);
    feedback.play('win');
    selected = null;
    render();
    const order = Array.from({ length: 81 }, (_, i) => i).sort((a, b) => ROW_OF[a]! + COL_OF[a]! - (ROW_OF[b]! + COL_OF[b]!));
    board.animate(order, 'flash', 12);
    setTimeout(() => showVictory(report), document.documentElement.dataset.motion === 'reduce' ? 0 : 900);
  }

  function showVictory(report: WinReport): void {
    const { outcome } = report;
    const unlockAll = S().unlockAll;
    const next = nextPuzzle(store.profile, ref!, unlockAll);
    const lines: HTMLElement[] = [];
    if (outcome.unlockedLevel) lines.push(h('li', null, icon('lock'), `${LEVEL_INFO[outcome.unlockedLevel].name} level unlocked!`));
    if (outcome.unlockedStage) lines.push(h('li', null, icon('lock'), `Stage ${outcome.unlockedStage} unlocked!`));
    if (outcome.levelCompleted) lines.push(h('li', null, icon('medal'), `${LEVEL_INFO[ref!.level].name} Badge earned!`));
    else if (outcome.stageCompleted) lines.push(h('li', null, icon('check'), `Stage ${ref!.stage} complete!`));
    for (const a of report.achievements) lines.push(h('li', { class: 'ach' }, icon('trophy'), h('span', null, h('strong', { text: a.title }), ` — ${a.description}`)));
    if (ref!.kind === 'daily') {
      const streak = currentStreak(store.profile, store.today());
      lines.push(h('li', null, icon('flame'), `${plural(streak, 'day')} streak`));
    }
    if (lines.length) feedback.play('unlock');

    const starsEl = stars(outcome.stars, 3, 'stars big-stars');
    const card = h(
      'div',
      { class: 'overlay-card victory' },
      h('div', { class: 'overlay-icon good' }, icon('trophy')),
      h('h2', { text: outcome.perfect ? 'Perfect solve!' : 'Puzzle solved!' }),
      starsEl,
      h(
        'dl',
        { class: 'result-grid' },
        h('div', null, h('dt', { text: 'Time' }), h('dd', null, formatTime(game.elapsedMs), outcome.newBest ? h('span', { class: 'new-best', text: 'New best' }) : null)),
        h('div', null, h('dt', { text: 'Mistakes' }), h('dd', { text: String(game.mistakes) })),
        h('div', null, h('dt', { text: 'Hints' }), h('dd', { text: String(game.hintsUsed) })),
      ),
      outcome.previousBestMs && !outcome.newBest ? h('p', { class: 'muted small', text: `Best time: ${formatTime(outcome.previousBestMs)}` }) : null,
      lines.length ? h('ul', { class: 'unlocks' }, lines) : null,
      ref!.kind === 'daily'
        ? h('button', { type: 'button', class: 'btn primary block', onClick: () => ctx.back('/daily') }, icon('calendar'), 'Back to calendar')
        : ref!.kind === 'ai'
          ? h('button', { type: 'button', class: 'btn primary block', onClick: () => ctx.back('/ai') }, icon('brain'), 'New puzzle')
          : next
          ? h('button', { type: 'button', class: 'btn primary block', onClick: () => ctx.navigate(`/play/${next.id}`, { replace: true }) }, icon('next'), next.level !== ref!.level ? `Next: ${LEVEL_INFO[next.level].name}` : 'Next puzzle')
          : null,
      h('div', { class: 'row-btns' },
        h('button', { type: 'button', class: 'btn ghost', onClick: () => ctx.navigate(`/play/${ref!.id}`, { replace: true }) }, icon('restart'), 'Replay'),
        h('button', { type: 'button', class: 'btn ghost', onClick: () => ctx.back(ref!.kind === 'stage' ? backTarget(ref!) : '/') }, icon('grid'), ref!.kind === 'stage' ? 'Stage' : 'Home'),
      ),
    );
    setOverlay(h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Puzzle solved' }, card));
    if (document.documentElement.dataset.motion !== 'reduce') starsEl.classList.add('reveal');
    announce(`Puzzle solved in ${formatTime(game.elapsedMs)} with ${plural(outcome.stars, 'star')}.`);
  }

  // ---------------------------------------------------------------- menu & leave
  function openMenu(): void {
    if (overlay && !paused) return;
    actionSheet('Game menu', [
      { icon: 'restart', label: 'Restart puzzle', action: () => void restart(), disabled: finished },
      { icon: 'dots', label: 'Fill all notes', hint: 'Write every possible candidate', action: () => fillNotes(), disabled: !game.playing },
      { icon: 'eraser', label: 'Clear all notes', action: () => clearNotes(), disabled: !game.playing },
      { icon: 'book', label: 'How to play', action: () => leave('/learn/rules') },
      { icon: 'sliders', label: 'Settings', action: () => leave('/settings') },
      { icon: 'home', label: 'Save & quit', action: () => leave() },
    ]);
  }

  function fillNotes(): void {
    if (!game.playing) return;
    const n = game.fillNotes();
    if (n) {
      if (!startedRecorded && game.started) {
        startedRecorded = true;
        store.gameStarted(ref!);
      }
      store.saveGame(game);
      toast(`Notes filled in ${plural(n, 'cell')}`, { ms: 1800 });
    }
    render();
  }

  function clearNotes(): void {
    if (game.clearNotes()) store.saveGame(game);
    render();
  }

  function leave(path?: string): void {
    store.saveGame(game);
    if (path) ctx.navigate(path);
    else ctx.back(backTarget(ref!));
  }

  // ---------------------------------------------------------------- keyboard
  function onKey(e: KeyboardEvent): void {
    if (document.querySelector('dialog[open]')) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') {
      if (session) closeHint();
      else if (paused) setPaused(false);
      else if (!overlay) setPaused(true);
      e.preventDefault();
      return;
    }
    if (overlay) return;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) doRedo();
      else doUndo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      doRedo();
      return;
    }
    if (mod || e.altKey) return;
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)?.[1] ?? (/^[1-9]$/.test(e.key) ? e.key : null);
    if (digit) {
      e.preventDefault();
      if (e.shiftKey && !notesMode && canPlay() && selected !== null) applyMove(game.toggleNote(selected, Number(digit)));
      else input(Number(digit));
      return;
    }
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const mv = moves[e.key];
    if (mv) {
      e.preventDefault();
      if (paused) return;
      const cur = selected ?? 40;
      const r = (ROW_OF[cur]! + (selected === null ? 0 : mv[0]) + 9) % 9;
      const c = (COL_OF[cur]! + (selected === null ? 0 : mv[1]) + 9) % 9;
      select(r * 9 + c);
      board.focusCell(r * 9 + c);
      return;
    }
    switch (e.key.toLowerCase()) {
      case 'backspace':
      case 'delete':
      case '0':
        e.preventDefault();
        doErase();
        break;
      case 'n':
        toggleNotes();
        break;
      case 'h':
        openHint();
        break;
      case 'p':
        setPaused(!paused);
        break;
    }
  }

  // ---------------------------------------------------------------- timer & lifecycle
  let last = performance.now();
  let lastSave = last;
  const timer = window.setInterval(() => {
    const now = performance.now();
    const dt = now - last;
    last = now;
    if (game.playing && !paused && !overlay && document.visibilityState === 'visible') {
      game.addTime(dt);
      updateTimer();
      if (now - lastSave > 5000 && game.started) {
        lastSave = now;
        store.saveGame(game);
      }
    }
  }, 250);

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      if (game.playing && game.started && !finished && !overlay) setPaused(true);
      store.saveGame(game);
    }
  };
  const onPageHide = () => store.saveGame(game);
  const unsubscribe = store.subscribe(() => render());
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);

  render();
  if (game.status === 'lost') showLost();
  // a random Sudoku AI challenge reveals its difficulty as it begins
  if (ref.kind === 'ai' && query.get('reveal') && !game.started) toast(`Randomizer: ${LEVEL_INFO[ref.level].name}`, { icon: 'bolt', ms: 4000 });

  return {
    el,
    title: puzzleTitle(ref),
    destroy() {
      clearInterval(timer);
      store.saveGame(game);
      unsubscribe();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    },
  };
};

/** Cells of a unit ordered by distance from `from`, for a ripple effect. */
function orderFrom(from: number, cells: readonly number[]): number[] {
  const d = (c: number) => Math.abs(ROW_OF[c]! - ROW_OF[from]!) + Math.abs(COL_OF[c]! - COL_OF[from]!);
  return [...cells].sort((a, b) => d(a) - d(b));
}

