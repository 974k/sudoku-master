import { LEVEL_INFO, dailyLevel, dailyPuzzleRef, refFromId, type PuzzleRef } from '../../game/catalog.ts';
import { currentStreak, totalStars, stagePuzzlesSolved } from '../../game/profile.ts';
import type { ScreenFactory } from '../app.ts';
import { formatTime, h } from '../dom.ts';
import { icon } from '../icons.ts';
import { updateButton } from '../update-ui.ts';

export function puzzleTitle(ref: PuzzleRef): string {
  if (ref.kind === 'daily') {
    const d = new Date(`${ref.date}T12:00`);
    return `Daily · ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  }
  if (ref.kind === 'ai') return `Sudoku AI · ${LEVEL_INFO[ref.level].name}`;
  return `${LEVEL_INFO[ref.level].name} · Stage ${ref.stage} · #${ref.number}`;
}

export const homeScreen: ScreenFactory = (ctx) => {
  const { store } = ctx;
  const today = store.today();
  const p = store.profile;
  const cont = store.continueTarget();
  const daily = dailyPuzzleRef(today);
  const dailyRec = p.records[daily.id];
  const dailyInProgress = store.hasSavedGame(daily.id);
  const streak = currentStreak(p, today);
  const weekday = new Date(`${today}T12:00`).toLocaleDateString(undefined, { weekday: 'long' });

  const chip = (ic: Parameters<typeof icon>[0], value: string, label: string) =>
    h('div', { class: 'chip', title: label }, icon(ic), h('strong', { text: value }), h('span', { class: 'sr-only', text: ` ${label}` }));

  const el = h(
    'main',
    { class: 'screen home' },
    updateButton(),
    h(
      'div',
      { class: 'hero' },
      h('div', { class: 'logo', 'aria-hidden': 'true' }, logoGrid()),
      h('h1', { text: 'Sudoku Master' }),
      h('p', { class: 'tagline', text: 'Ad-free · Offline · Private' }),
    ),
    h(
      'div',
      { class: 'chips', 'aria-label': 'Your progress' },
      chip('flame', String(streak), 'day streak'),
      chip('star', String(totalStars(p)), 'stars'),
      chip('check', String(stagePuzzlesSolved(p)), 'puzzles solved'),
    ),
    h(
      'nav',
      { class: 'home-actions', 'aria-label': 'Main menu' },
      cont
        ? h(
            'button',
            { type: 'button', class: 'card-btn continue', onClick: () => ctx.navigate(`/play/${cont.ref.id}`) },
            h('span', { class: 'card-icon accent' }, icon('play')),
            h(
              'span',
              { class: 'card-text' },
              h('strong', { text: 'Continue' }),
              h('small', { text: `${puzzleTitle(refFromId(cont.ref.id)!)} · ${formatTime(cont.snapshot.elapsedMs)}` }),
            ),
            icon('next', 'icon chevron'),
          )
        : null,
      h(
        'button',
        { type: 'button', class: 'btn primary xl', onClick: () => ctx.navigate('/levels') },
        icon('grid'),
        h('span', { text: 'Play' }),
      ),
      h(
        'button',
        { type: 'button', class: 'card-btn', onClick: () => ctx.navigate('/daily') },
        h('span', { class: 'card-icon gold' }, icon('calendar')),
        h(
          'span',
          { class: 'card-text' },
          h('strong', { text: 'Daily Challenge' }),
          h('small', {
            text: `${weekday} · ${LEVEL_INFO[dailyLevel(today)].name} · ${dailyRec ? `Solved in ${formatTime(dailyRec.bestMs)}` : dailyInProgress ? 'In progress' : 'Not played yet'}`,
          }),
        ),
        dailyRec ? h('span', { class: 'done-badge', 'aria-label': 'Completed' }, icon('check')) : icon('next', 'icon chevron'),
      ),
      h(
        'button',
        { type: 'button', class: 'card-btn', onClick: () => ctx.navigate('/ai') },
        h('span', { class: 'card-icon accent' }, icon('brain')),
        h('span', { class: 'card-text' }, h('strong', { text: 'Sudoku AI' }), h('small', { text: 'New puzzles generated on your device' })),
        icon('next', 'icon chevron'),
      ),
      h(
        'div',
        { class: 'tile-row' },
        tile('book', 'Learn', () => ctx.navigate('/learn')),
        tile('chart', 'Statistics', () => ctx.navigate('/stats')),
        tile('sliders', 'Settings', () => ctx.navigate('/settings')),
      ),
    ),
    !store.storage.persistent
      ? h('p', { class: 'notice warn', role: 'note' }, 'This browser is blocking local storage, so progress will be lost when you close the page.')
      : null,
    h(
      'footer',
      { class: 'home-foot' },
      icon('shield'),
      h('span', null, 'No ads, no accounts, no tracking. ', h('a', { href: '#/privacy', text: 'Your data stays on this device.' })),
    ),
  );
  return { el, title: 'Sudoku Master' };
};

function tile(ic: Parameters<typeof icon>[0], label: string, onClick: () => void): HTMLElement {
  return h('button', { type: 'button', class: 'tile', onClick }, icon(ic), h('span', { text: label }));
}

function logoGrid(): HTMLElement {
  const g = h('div', { class: 'logo-grid' });
  const filled: Record<number, string> = { 0: '5', 4: '3', 8: '9', 2: '1', 6: '7' };
  for (let i = 0; i < 9; i++) g.appendChild(h('span', { text: filled[i] ?? '' }));
  return g;
}
