import { ACHIEVEMENTS, type Achievement } from '../../game/achievements.ts';
import { LEVEL_INFO, LEVELS } from '../../game/catalog.ts';
import {
  accuracy,
  currentStreak,
  dailySolved,
  gamesStarted,
  gamesWon,
  levelProgress,
  stagePuzzlesSolved,
  totalStars,
} from '../../game/profile.ts';
import type { ScreenFactory } from '../app.ts';
import { progressBar, topBar } from '../components.ts';
import { formatDuration, formatTime, h } from '../dom.ts';
import { icon } from '../icons.ts';

// never round 99.6% up to a misleading 100%
const pct = (x: number | null) => (x === null ? '—' : x < 1 && x >= 0.995 ? `${Math.floor(x * 1000) / 10}%` : `${Math.round(x * 100)}%`);

export const statsScreen: ScreenFactory = (ctx) => {
  const { store } = ctx;
  const p = store.profile;
  const today = store.today();
  const started = gamesStarted(p);
  const won = gamesWon(p);
  const totalMs = LEVELS.reduce((s, l) => s + p.levels[l].totalMs, 0);

  const tile = (ic: Parameters<typeof icon>[0], value: string, label: string) =>
    h('div', { class: 'stat-tile' }, icon(ic), h('strong', { text: value }), h('span', { text: label }));

  const overview = h(
    'div',
    { class: 'stat-tiles' },
    tile('check', String(stagePuzzlesSolved(p)), 'puzzles solved'),
    tile('trophy', String(won), 'games won'),
    tile('target', started ? pct(won / started) : '—', 'win rate'),
    tile('shield', pct(accuracy(p)), 'accuracy'),
    tile('star', String(totalStars(p)), 'stars'),
    tile('flame', String(currentStreak(p, today)), 'day streak'),
    tile('flame', String(p.streak.best), 'best streak'),
    tile('calendar', String(dailySolved(p)), 'dailies'),
    tile('clock', totalMs ? formatDuration(totalMs) : '—', 'time played'),
    tile('bulb', String(p.hints), 'hints used'),
  );

  const table = h(
    'table',
    { class: 'level-table' },
    h('caption', { class: 'sr-only', text: 'Statistics by level' }),
    h('thead', null, h('tr', null, ...['Level', 'Solved', 'Win rate', 'Best', 'Average', 'Perfect'].map((t) => h('th', { scope: 'col', text: t })))),
    h(
      'tbody',
      null,
      LEVELS.map((l) => {
        const s = p.levels[l];
        const lp = levelProgress(p, l);
        return h(
          'tr',
          null,
          h('th', { scope: 'row' }, h('span', { class: `level-swatch lvl-${l}`, 'aria-hidden': 'true' }), LEVEL_INFO[l].name),
          h('td', { text: `${lp.solved}/100` }),
          h('td', { text: s.started ? pct(Math.min(1, s.won / s.started)) : '—' }),
          h('td', { text: s.bestMs ? formatTime(s.bestMs) : '—' }),
          h('td', { text: s.won ? formatTime(s.totalMs / s.won) : '—' }),
          h('td', { text: String(s.perfect) }),
        );
      }),
    ),
  );

  const badges = h(
    'div',
    { class: 'badges' },
    LEVELS.map((l) => {
      const lp = levelProgress(p, l);
      const earned = lp.complete;
      return h(
        'div',
        { class: `badge lvl-${l}${earned ? ' earned' : ''}${lp.gold ? ' gold' : ''}`, title: earned ? `${LEVEL_INFO[l].name} Badge earned` : `${lp.solved}/100 solved` },
        h('div', { class: 'badge-medal' }, icon(earned ? 'medal' : 'lock')),
        h('strong', { text: LEVEL_INFO[l].name }),
        h('small', { text: earned ? (lp.gold ? 'Gold' : 'Earned') : `${lp.solved}/100` }),
      );
    }),
  );

  const unlockedCount = ACHIEVEMENTS.filter((a) => p.achievements[a.id]).length;
  const achList = h(
    'ul',
    { class: 'achievements' },
    ACHIEVEMENTS.filter((a) => !a.badge).map((a) => achievementItem(a, p.achievements[a.id], a.progress?.(p))),
  );

  const el = h(
    'main',
    { class: 'screen' },
    topBar({ title: 'Statistics', back: () => ctx.back('/') }),
    h(
      'div',
      { class: 'content' },
      h('section', null, h('h2', { class: 'section-title', text: 'Overview' }), overview),
      h('section', null, h('h2', { class: 'section-title', text: 'By level' }), h('div', { class: 'table-wrap' }, table)),
      h('section', null, h('h2', { class: 'section-title', text: 'Badges' }), badges),
      h('section', null, h('h2', { class: 'section-title', text: `Achievements · ${unlockedCount}/${ACHIEVEMENTS.length}` }), achList),
    ),
  );
  return { el, title: 'Statistics' };
};

function achievementItem(a: Achievement, unlockedAt: number | undefined, progress?: [number, number]): HTMLElement {
  return h(
    'li',
    { class: `ach-item${unlockedAt ? ' unlocked' : ''}` },
    h('div', { class: 'ach-icon' }, icon(unlockedAt ? a.icon : 'lock')),
    h(
      'div',
      { class: 'ach-text' },
      h('strong', { text: a.title }),
      h('span', { text: a.description }),
      unlockedAt
        ? h('small', { class: 'muted', text: `Unlocked ${new Date(unlockedAt).toLocaleDateString()}` })
        : progress && progress[1] > 1
          ? h('div', { class: 'ach-progress' }, progressBar(progress[0] / progress[1], `${a.title} progress`), h('small', { text: `${progress[0]}/${progress[1]}` }))
          : null,
    ),
  );
}
