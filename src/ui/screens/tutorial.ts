import { BOX_OF, COL_OF, ROW_OF, UNITS, bit, digitsOf, parseGrid } from '../../engine/board.ts';
import { LESSONS, type LessonTask } from '../../game/tutorial.ts';
import type { ScreenFactory } from '../app.ts';
import { BoardView } from '../board.ts';
import { announce, toast, topBar } from '../components.ts';
import { append, h } from '../dom.ts';
import { icon } from '../icons.ts';

export const tutorialListScreen: ScreenFactory = (ctx) => {
  const done = ctx.store.profile.tutorialDone;
  const el = h(
    'main',
    { class: 'screen' },
    topBar({ title: 'Tutorial', back: () => ctx.back('/learn') }),
    h(
      'div',
      { class: 'content narrow' },
      h('p', { class: 'muted', text: 'Short, hands-on lessons. Each one takes about a minute.' }),
      h(
        'ol',
        { class: 'stack lesson-list' },
        LESSONS.map((l, i) =>
          h(
            'li',
            null,
            h(
              'button',
              { type: 'button', class: 'card-btn compact', onClick: () => ctx.navigate(`/tutorial/${i + 1}`) },
              h('span', { class: 'lesson-num', text: String(i + 1) }),
              h('span', { class: 'card-text' }, h('strong', { text: l.title }), h('small', { text: `${l.tasks.filter((t) => t.kind !== 'read').length || 1} step${l.tasks.length > 1 ? 's' : ''}` })),
              icon('next', 'icon chevron'),
            ),
          ),
        ),
      ),
      done ? h('p', { class: 'notice', text: 'You have completed the tutorial. Replay any lesson whenever you like.' }) : null,
    ),
  );
  return { el, title: 'Tutorial' };
};

export const lessonScreen: ScreenFactory = (ctx, [num]) => {
  const index = Number(num) - 1;
  const lesson = LESSONS[index];
  if (!lesson) throw new Error('no such lesson');
  const { store, feedback } = ctx;
  const values = parseGrid(lesson.givens);
  const givens = parseGrid(lesson.givens);
  const solution = parseGrid(lesson.solution);
  const notes = new Uint16Array(81);
  let taskIndex = 0;
  let selected: number | null = null;
  let notesMode = false;
  let solvedTask = false;
  let message: { text: string; tone: 'info' | 'good' | 'bad' } | null = null;

  const board = new BoardView({ label: `Tutorial board: ${lesson.title}`, onSelect: (i) => select(i) });
  const card = h('section', { class: 'lesson-card', 'aria-live': 'polite' });
  const pad = h('div', { class: 'numpad lesson-pad', role: 'group', 'aria-label': 'Number pad' });
  for (let d = 1; d <= 9; d++) pad.appendChild(h('button', { type: 'button', class: 'pad-btn', onClick: () => input(d), 'aria-label': String(d) }, h('span', { class: 'pad-digit', text: String(d) })));
  const notesBtn = h('button', { type: 'button', class: 'tool', 'aria-pressed': 'false', onClick: () => toggleNotes() }, icon('pencil'), h('span', { class: 'tool-label', text: 'Notes' }));
  const eraseBtn = h('button', { type: 'button', class: 'tool', onClick: () => erase() }, icon('eraser'), h('span', { class: 'tool-label', text: 'Erase' }));
  const tools = h('div', { class: 'tools lesson-tools' }, eraseBtn, notesBtn);
  const dots = h('div', { class: 'lesson-dots', 'aria-hidden': 'true' }, LESSONS.map((_, i) => h('span', { class: i < index ? 'done' : i === index ? 'on' : '' })));

  const task = (): LessonTask => lesson.tasks[taskIndex]!;

  function render(): void {
    const t = task();
    const hl = t.highlight;
    const unitCells = new Set<number>();
    for (const u of hl?.units ?? []) for (const c of UNITS[u]!) unitCells.add(c);
    const target = t.kind !== 'read' && !solvedTask ? t.cell : undefined;
    board.render({
      values,
      givens,
      notes,
      isWrong: (i) => values[i] !== 0 && values[i] !== solution[i],
      selected,
      highlightRegion: false,
      highlightSame: false,
      overlay: { unitCells, pattern: new Set(hl?.cells ?? []), place: target },
    });
    const interactive = t.kind !== 'read' && !solvedTask;
    pad.hidden = !interactive;
    tools.hidden = !interactive;
    notesBtn.hidden = t.kind !== 'notes';
    notesBtn.classList.toggle('on', notesMode);
    notesBtn.setAttribute('aria-pressed', String(notesMode));
    pad.classList.toggle('notes-mode', notesMode);

    const isLastTask = taskIndex === lesson.tasks.length - 1;
    const isLastLesson = index === LESSONS.length - 1;
    const nextLabel = !isLastTask ? 'Continue' : isLastLesson ? 'Finish tutorial' : 'Next lesson';
    card.replaceChildren();
    append(
      card,
      h('p', { class: 'lesson-step', text: `Lesson ${index + 1} of ${LESSONS.length} · ${lesson.title}` }),
      h('p', { class: 'lesson-text', text: solvedTask && t.kind !== 'read' ? t.success : t.text }),
      message && !solvedTask ? h('p', { class: `lesson-msg ${message.tone}`, text: message.text }) : null,
      t.kind === 'read' || solvedTask ? h('button', { type: 'button', class: 'btn primary', onClick: advance }, nextLabel, icon('next')) : null,
    );
  }

  function select(i: number): void {
    selected = i;
    message = null;
    render();
  }

  function why(cell: number, d: number): string | null {
    for (const [unit, name] of [[ROW_OF[cell]!, 'row'], [9 + COL_OF[cell]!, 'column'], [18 + BOX_OF[cell]!, 'box']] as const) {
      if (UNITS[unit]!.some((c) => c !== cell && values[c] === d)) return `There is already a ${d} in this ${name}.`;
    }
    return null;
  }

  function input(d: number): void {
    const t = task();
    if (t.kind === 'read' || solvedTask) return;
    if (selected === null) {
      message = { text: 'First tap the highlighted cell.', tone: 'info' };
      render();
      return;
    }
    if (selected !== t.cell) {
      message = { text: 'Try the highlighted cell.', tone: 'info' };
      render();
      return;
    }
    if (t.kind === 'notes') {
      if (!notesMode) {
        message = { text: 'Turn on notes mode first (the pencil button, or press N).', tone: 'info' };
        render();
        return;
      }
      notes[t.cell]! ^= bit(d);
      feedback.play('note');
      const have = digitsOf(notes[t.cell]!);
      if (have.join() === t.digits.join()) complete();
      else {
        const extra = have.filter((x) => !t.digits.includes(x));
        message = extra.length ? { text: why(t.cell, extra[0]!) ?? `${extra[0]} can't go here.`, tone: 'bad' } : { text: `${have.length} of ${t.digits.length} found…`, tone: 'info' };
        render();
      }
      return;
    }
    if (d === t.digit) {
      values[t.cell] = d;
      notes[t.cell] = 0;
      board.animate([t.cell], 'pop', 0, 'v');
      complete();
    } else {
      feedback.play('mistake');
      board.animate([t.cell], 'shake', 0, 'v');
      message = { text: why(t.cell, d) ?? `${d} isn't ruled out here, but nothing forces it either. Follow the instruction above.`, tone: 'bad' };
      render();
    }
  }

  function complete(): void {
    solvedTask = true;
    feedback.play('place');
    announce('Correct!');
    render();
  }

  function erase(): void {
    if (selected === null || givens[selected] || task().kind === 'read') return;
    notes[selected] = 0;
    render();
  }

  function toggleNotes(): void {
    notesMode = !notesMode;
    render();
  }

  /** When a task asks for an answer, put the cursor on its cell so it can be entered right away. */
  function focusTask(): void {
    const t = task();
    if (t.kind === 'read' || solvedTask) return;
    selected = t.cell;
    render();
    board.focusCell(t.cell, true);
  }

  function advance(): void {
    if (taskIndex < lesson.tasks.length - 1) {
      taskIndex++;
      solvedTask = false;
      message = null;
      if (task().kind === 'read') {
        selected = null;
        render();
      } else focusTask();
      return;
    }
    if (index < LESSONS.length - 1) {
      ctx.navigate(`/tutorial/${index + 2}`, { replace: true });
      return;
    }
    const fresh = store.completeTutorial();
    for (const a of fresh) toast(a.description, { icon: 'trophy', title: a.title });
    feedback.play('win');
    ctx.back('/learn');
  }

  const onKey = (e: KeyboardEvent) => {
    if (document.querySelector('dialog[open]')) return;
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)?.[1];
    if (digit) {
      e.preventDefault();
      input(Number(digit));
    } else if (e.key.toLowerCase() === 'n' && task().kind === 'notes') toggleNotes();
    else if (e.key === 'Enter' && (task().kind === 'read' || solvedTask) && !(e.target instanceof HTMLButtonElement)) advance();
  };
  document.addEventListener('keydown', onKey);

  const el = h(
    'main',
    { class: 'screen lesson' },
    topBar({ title: lesson.title, subtitle: `Lesson ${index + 1} of ${LESSONS.length}`, back: () => ctx.back('/tutorial') }),
    dots,
    h('div', { class: 'play-body' }, h('div', { class: 'board-col' }, h('div', { class: 'board-wrap' }, board.el)), h('div', { class: 'controls' }, card, tools, pad)),
  );
  render();
  // a lesson that opens on a question: focus once the screen is on the page
  if (task().kind !== 'read') setTimeout(focusTask);
  return { el, title: lesson.title, destroy: () => document.removeEventListener('keydown', onKey) };
};
