import { UNITS, parseGrid } from '../../engine/board.ts';
import { explainStep } from '../../engine/explain.ts';
import { applyStep, cloneState, createState, findNextStep, type TechniqueId } from '../../engine/logic.ts';
import { TECHNIQUE_EXAMPLES } from '../../data/puzzles.ts';
import { LESSONS } from '../../game/tutorial.ts';
import { LEVEL_UNLOCK_STAGES, STAGE_UNLOCK_REQUIREMENT } from '../../game/catalog.ts';
import type { ScreenFactory } from '../app.ts';
import { BoardView } from '../board.ts';
import { toggle, topBar } from '../components.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { GUIDE, GUIDE_BY_ID } from '../guide.ts';
import { stepOverlay } from '../overlay.ts';

export const learnScreen: ScreenFactory = (ctx) => {
  const { store } = ctx;
  const card = (ic: Parameters<typeof icon>[0], title: string, text: string, path: string, extra?: string) =>
    h(
      'button',
      { type: 'button', class: 'card-btn', onClick: () => ctx.navigate(path) },
      h('span', { class: 'card-icon accent' }, icon(ic)),
      h('span', { class: 'card-text' }, h('strong', { text: title }), h('small', { text })),
      extra ? h('span', { class: 'done-badge', 'aria-label': extra }, icon('check')) : icon('next', 'icon chevron'),
    );
  const el = h(
    'main',
    { class: 'screen' },
    topBar({ title: 'Learn', back: () => ctx.back('/') }),
    h(
      'div',
      { class: 'content narrow' },
      h(
        'div',
        { class: 'stack' },
        card('play', 'Interactive tutorial', `${LESSONS.length} short hands-on lessons`, '/tutorial', store.profile.tutorialDone ? 'Completed' : undefined),
        card('book', 'How to play', 'The rules, notes, stars and progression', '/learn/rules'),
        card('brain', 'Techniques guide', 'Every solving technique, with real examples', '/learn/techniques'),
        card('grid', 'Controls', 'Touch, mouse and keyboard shortcuts', '/learn/controls'),
      ),
      h(
        'div',
        { class: 'set-card' },
        h(
          'div',
          { class: 'set-row' },
          h('div', { class: 'set-text' }, h('span', { id: 'lm-label', class: 'set-label', text: 'Learning mode' }), h('small', { text: 'Hints explain every step in full, and selecting a cell shows which digits fit and why.' })),
          toggle(store.settings.learningMode, (v) => store.updateSettings({ learningMode: v }), 'Learning mode'),
        ),
      ),
    ),
  );
  return { el, title: 'Learn' };
};

export const rulesScreen: ScreenFactory = (ctx) => {
  const demo = new BoardView({ interactive: false, label: 'Example: a row, a column and a box' });
  const solved = parseGrid('483921657967345821251876493548132976729564138136798245372689514814253769695417382');
  const givens = solved.map((d, i) => ((i * 7) % 5 === 0 ? 0 : d));
  demo.render({
    values: givens,
    givens,
    notes: new Uint16Array(81),
    isWrong: () => false,
    selected: null,
    highlightRegion: false,
    highlightSame: false,
    overlay: { unitCells: new Set([...UNITS[1]!, ...UNITS[9 + 6]!]), pattern: new Set(UNITS[18 + 6]) },
  });
  const el = h(
    'main',
    { class: 'screen' },
    topBar({ title: 'How to play', back: () => ctx.back('/learn') }),
    h(
      'div',
      { class: 'content narrow prose' },
      h('h2', { text: 'The goal' }),
      h('p', { text: 'Fill the 9×9 grid so that every row, every column and every 3×3 box contains each digit from 1 to 9 exactly once.' }),
      h('div', { class: 'demo-board' }, demo.el),
      h('p', { class: 'muted small center', text: 'A row and a column (shaded) and a box (outlined). Each must hold 1–9 once.' }),
      h('h2', { text: 'Playing' }),
      h('ul', null,
        h('li', { text: 'Tap a cell, then tap a digit. Grey digits are the given clues and cannot be changed.' }),
        h('li', { text: 'Wrong digits turn red and count as a mistake. Correct digits lock in place.' }),
        h('li', { text: 'Use Notes (the pencil) to jot down candidates. Placing a digit removes it from notes in the same row, column and box.' }),
        h('li', { text: 'Undo and Redo step through your moves. Mistakes are still counted after an undo.' }),
        h('li', { text: 'Every puzzle has exactly one solution and can be solved by logic alone — no guessing needed.' }),
      ),
      h('h2', { text: 'Hints' }),
      h('p', { text: 'A hint first tells you which technique to look for and where. Ask again and it explains the reasoning step by step, highlighting the cells involved, then offers to place the digit. Hints teach rather than just reveal.' }),
      h('h2', { text: 'Stars' }),
      h('ul', null,
        h('li', null, h('strong', { text: '3 stars' }), ' — no mistakes and no hints.'),
        h('li', null, h('strong', { text: '2 stars' }), ' — up to 2 mistakes and up to 2 hints.'),
        h('li', null, h('strong', { text: '1 star' }), ' — solved.'),
      ),
      h('p', { text: 'Replaying a puzzle keeps your best stars and best time.' }),
      h('h2', { text: 'Levels and stages' }),
      h('p', { text: `There are five levels — Beginner, Easy, Medium, Hard and Expert — each with 10 stages of 10 puzzles. Solve ${STAGE_UNLOCK_REQUIREMENT} puzzles in a stage to unlock the next, and clear ${LEVEL_UNLOCK_STAGES} stages to unlock the next level. Puzzles get gradually harder within each level. Solve all 100 puzzles of a level to earn its badge.` }),
      h('h2', { text: 'Daily challenge and streaks' }),
      h('p', { text: 'A fresh puzzle arrives every day. Solve any puzzle on consecutive days to build your streak, and earn achievements as you go.' }),
    ),
  );
  return { el, title: 'How to play' };
};

export const controlsScreen: ScreenFactory = (ctx) => {
  const keys: [string, string][] = [
    ['1 – 9', 'Enter a digit (or a note in notes mode)'],
    ['Shift + 1 – 9', 'Toggle a note without switching modes'],
    ['Arrow keys', 'Move the selection'],
    ['Backspace / Delete / 0', 'Erase the selected cell'],
    ['N', 'Toggle notes mode'],
    ['H', 'Hint (press again for more detail)'],
    ['Ctrl/⌘ + Z', 'Undo'],
    ['Ctrl/⌘ + Y or Shift + Ctrl/⌘ + Z', 'Redo'],
    ['P or Esc', 'Pause and resume'],
  ];
  const el = h(
    'main',
    { class: 'screen' },
    topBar({ title: 'Controls', back: () => ctx.back('/learn') }),
    h(
      'div',
      { class: 'content narrow prose' },
      h('h2', { text: 'Touch and mouse' }),
      h('p', { text: 'Tap a cell to select it, then tap a digit on the number pad. Tap the pencil to switch to notes mode. The small numbers on the pad show how many of each digit are left.' }),
      h('h2', { text: 'Keyboard' }),
      h('table', { class: 'keys' }, h('tbody', null, keys.map(([k, v]) => h('tr', null, h('th', { scope: 'row' }, h('kbd', { text: k })), h('td', { text: v }))))),
      h('p', { class: 'muted', text: 'The game pauses automatically when you switch away, and your progress is saved after every move.' }),
    ),
  );
  return { el, title: 'Controls' };
};

export const techniquesScreen: ScreenFactory = (ctx) => {
  const groups: Record<string, typeof GUIDE[number][]> = {};
  for (const g of GUIDE) (groups[g.level] ??= []).push(g);
  const order = ['Basics', 'Medium', 'Hard', 'Expert'];
  const el = h(
    'main',
    { class: 'screen' },
    topBar({ title: 'Techniques', back: () => ctx.back('/learn') }),
    h(
      'div',
      { class: 'content narrow' },
      h('p', { class: 'muted', text: 'These are the techniques the hint guide uses. Every puzzle in the game can be solved with them — no guessing.' }),
      order.map((lvl) =>
        h(
          'section',
          null,
          h('h2', { class: 'section-title', text: lvl === 'Basics' ? 'Basics (Beginner & Easy)' : lvl }),
          h(
            'div',
            { class: 'stack' },
            (groups[lvl] ?? []).map((g) =>
              h(
                'button',
                { type: 'button', class: 'card-btn compact', onClick: () => ctx.navigate(`/learn/technique/${g.id}`) },
                h('span', { class: 'card-text' }, h('strong', { text: g.name }), h('small', { text: g.summary })),
                icon('next', 'icon chevron'),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  return { el, title: 'Techniques' };
};

export const techniqueScreen: ScreenFactory = (ctx, [id]) => {
  const entry = GUIDE_BY_ID[id as TechniqueId];
  if (!entry) throw new Error('unknown technique');
  const example = TECHNIQUE_EXAMPLES[entry.id];
  let exampleSection: HTMLElement | null = null;
  if (example) {
    // replay the solver to the position where this technique applies
    const state = createState(parseGrid(example.puzzle));
    for (let i = 0; i < example.step; i++) {
      const s = findNextStep(state);
      if (!s) break;
      applyStep(state, s);
    }
    const before = cloneState(state);
    const step = findNextStep(state);
    if (step && step.technique === entry.id) {
      const view = new BoardView({ interactive: false, label: `Example position for ${entry.name}` });
      const ov = stepOverlay(step, before);
      if (!ov.cands) ov.cands = before.cands; // show candidates for context
      const givens = parseGrid(example.puzzle);
      view.render({ values: before.values, givens, notes: new Uint16Array(81), isWrong: () => false, selected: null, highlightRegion: false, highlightSame: false, overlay: ov });
      const ex = explainStep(step, before);
      exampleSection = h(
        'section',
        { class: 'example' },
        h('h2', { text: 'Example from a real puzzle' }),
        h('div', { class: 'demo-board' }, view.el),
        h(
          'p',
          { class: 'legend' },
          step.eliminations.length ? [h('span', { class: 'lg pattern', text: '1' }), ' pattern  ', h('span', { class: 'lg elim', text: '1' }), ' removed  '] : null,
          step.placement ? [h('span', { class: 'lg place', text: '1' }), ' placed'] : null,
        ),
        h('p', { text: ex.detail }),
      );
    }
  }
  const el = h(
    'main',
    { class: 'screen' },
    topBar({ title: entry.name, subtitle: entry.level === 'Basics' ? 'Basic technique' : `${entry.level} technique`, back: () => ctx.back('/learn/techniques') }),
    h('div', { class: 'content narrow prose' }, h('p', { class: 'lead', text: entry.summary }), entry.body.map((p) => h('p', { text: p })), exampleSection),
  );
  return { el, title: entry.name };
};
