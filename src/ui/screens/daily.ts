import { DAILY_SCHEDULE, LEVEL_INFO, dailyLevel, dailyPuzzleRef, dateKey, parseDateKey } from '../../game/catalog.ts';
import { currentStreak, dailySolved } from '../../game/profile.ts';
import type { ScreenFactory } from '../app.ts';
import { iconButton, stars, topBar } from '../components.ts';
import { formatTime, h } from '../dom.ts';
import { icon } from '../icons.ts';

const MONTHS_BACK = 24;

export const dailyScreen: ScreenFactory = (ctx, _params, query) => {
  const { store } = ctx;
  const today = store.today();
  const todayDate = parseDateKey(today)!;
  const p = store.profile;

  const m = /^(\d{4})-(\d{2})$/.exec(query.get('m') ?? '');
  let year = m ? Number(m[1]) : todayDate.getFullYear();
  let month = m ? Number(m[2]) - 1 : todayDate.getMonth();
  const monthIndex = (y: number, mo: number) => y * 12 + mo;
  const maxIdx = monthIndex(todayDate.getFullYear(), todayDate.getMonth());
  const minIdx = maxIdx - MONTHS_BACK;
  if (monthIndex(year, month) > maxIdx || monthIndex(year, month) < minIdx) {
    year = todayDate.getFullYear();
    month = todayDate.getMonth();
  }
  let selectedDay = query.get('d') && parseDateKey(query.get('d')!) && query.get('d')! <= today ? query.get('d')! : null;
  if (!selectedDay) selectedDay = monthIndex(year, month) === maxIdx ? today : dateKey(new Date(year, month, 1));

  const go = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    ctx.navigate(`/daily?m=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, { replace: true });
  };

  const monthName = new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const prevBtn = iconButton('back', 'Previous month', () => go(-1));
  const nextBtn = iconButton('next', 'Next month', () => go(1));
  prevBtn.disabled = monthIndex(year, month) <= minIdx;
  nextBtn.disabled = monthIndex(year, month) >= maxIdx;

  const grid = h('div', { class: 'cal-grid', role: 'grid', 'aria-label': monthName });
  const weekdays = h('div', { class: 'cal-head', role: 'row' });
  for (let w = 0; w < 7; w++) {
    const name = new Date(2024, 0, 7 + w).toLocaleDateString(undefined, { weekday: 'narrow' });
    const full = new Date(2024, 0, 7 + w).toLocaleDateString(undefined, { weekday: 'long' });
    weekdays.appendChild(h('span', { role: 'columnheader', title: `${full}: ${LEVEL_INFO[DAILY_SCHEDULE[w]!].name}`, 'aria-label': full, text: name }));
  }

  const panel = h('section', { class: 'day-panel', 'aria-live': 'polite' });
  const dayButtons = new Map<string, HTMLButtonElement>();
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  let solvedThisMonth = 0;
  const cells: HTMLElement[] = [];
  for (let k = 0; k < first.getDay(); k++) cells.push(h('span', { class: 'cal-empty', 'aria-hidden': 'true' }));
  for (let d = 1; d <= days; d++) {
    const key = dateKey(new Date(year, month, d));
    const future = key > today;
    const rec = p.records[`daily-${key}`];
    const active = !rec && store.hasSavedGame(`daily-${key}`);
    if (rec) solvedThisMonth++;
    const level = dailyLevel(key);
    const btn = h(
      'button',
      {
        type: 'button',
        class: `cal-day lvl-${level}${key === today ? ' today' : ''}${rec ? ' solved' : ''}${active ? ' active' : ''}`,
        disabled: future,
        'aria-label': `${new Date(year, month, d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}, ${LEVEL_INFO[level].name}${rec ? ', solved' : active ? ', in progress' : ''}`,
        onClick: () => selectDay(key),
      },
      h('span', { class: 'cal-num', text: String(d) }),
      rec ? icon('check', 'icon cal-check') : h('span', { class: 'cal-dot', 'aria-hidden': 'true' }),
    );
    dayButtons.set(key, btn);
    cells.push(btn);
  }
  grid.append(weekdays, h('div', { class: 'cal-days' }, cells));

  function selectDay(key: string): void {
    selectedDay = key;
    for (const [k, b] of dayButtons) b.setAttribute('aria-pressed', String(k === key));
    const ref = dailyPuzzleRef(key);
    const rec = p.records[ref.id];
    const active = store.hasSavedGame(ref.id);
    const date = parseDateKey(key)!;
    panel.replaceChildren(
      h(
        'div',
        { class: 'day-info' },
        h('h2', { text: key === today ? 'Today' : date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) }),
        h('p', { class: `level-chip lvl-${ref.level}`, text: LEVEL_INFO[ref.level].name }),
        rec ? h('p', { class: 'day-result' }, stars(rec.stars), ` Best ${formatTime(rec.bestMs)}`) : h('p', { class: 'muted', text: active ? 'In progress' : 'Not played yet' }),
      ),
      h(
        'button',
        { type: 'button', class: 'btn primary', onClick: () => ctx.navigate(`/play/${ref.id}`) },
        icon(rec ? 'restart' : 'play'),
        rec ? 'Play again' : active ? 'Continue' : 'Play',
      ),
    );
  }
  if (selectedDay && dayButtons.has(selectedDay)) selectDay(selectedDay);

  const el = h(
    'main',
    { class: 'screen daily' },
    topBar({ title: 'Daily Challenge', back: () => ctx.back('/') }),
    h(
      'div',
      { class: 'content narrow daily-content' },
      h(
        'div',
        { class: 'summary-stats' },
        h('div', { class: 'stat' }, h('strong', null, icon('flame'), String(currentStreak(p, today))), h('span', { text: 'day streak' })),
        h('div', { class: 'stat' }, h('strong', { text: String(p.streak.best) }), h('span', { text: 'best streak' })),
        h('div', { class: 'stat' }, h('strong', { text: String(dailySolved(p)) }), h('span', { text: 'dailies solved' })),
      ),
      h(
        'section',
        { class: 'calendar' },
        h('div', { class: 'cal-bar' }, prevBtn, h('h2', { text: monthName }), nextBtn),
        grid,
        h('p', { class: 'muted small center', text: `${solvedThisMonth} of ${monthIndex(year, month) === maxIdx ? todayDate.getDate() : days} solved this month` }),
      ),
      panel,
      h('p', { class: 'hint-text', text: 'A new puzzle every day: easy early in the week, building to an expert challenge on Sunday. Solve any puzzle on consecutive days to grow your streak.' }),
    ),
  );
  return { el, title: 'Daily Challenge' };
};
