import { gridToString } from '../../engine/board.ts';
import { pickRandomLevel, tryGenerateForLevel, type LevelPuzzle } from '../../engine/levelgen.ts';
import { createRng, type Rng } from '../../engine/rng.ts';
import { LEVEL_INFO, LEVELS, aiPuzzleRef, type LevelId } from '../../game/catalog.ts';
import type { ScreenFactory } from '../app.ts';
import { topBar } from '../components.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';

/** Fresh randomness for each puzzle (local only). */
function freshRng(): Rng {
  const seed = new Uint32Array(4);
  crypto.getRandomValues(seed);
  return createRng(Array.from(seed).join('-'));
}

/**
 * Generates and validates a puzzle for `level` without freezing the page:
 * attempts run in short slices, yielding to the browser in between.
 */
async function generate(level: LevelId, rng: Rng, cancelled: () => boolean, timeoutMs = 60_000): Promise<LevelPuzzle | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !cancelled()) {
    const sliceEnd = performance.now() + 25;
    while (performance.now() < sliceEnd) {
      const found = tryGenerateForLevel(level, rng);
      if (found) return found;
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  return null;
}

export const aiScreen: ScreenFactory = (ctx) => {
  let busy = false;
  let left = false;
  const status = h('p', { class: 'notice', role: 'status', 'aria-live': 'polite', hidden: true });
  const buttons: HTMLButtonElement[] = [];

  async function start(choice: LevelId | 'random'): Promise<void> {
    if (busy) return;
    busy = true;
    for (const b of buttons) b.disabled = true;
    const rng = freshRng();
    // random: every level equally likely, picked anew for each challenge
    const level = choice === 'random' ? pickRandomLevel(rng) : choice;
    status.hidden = false;
    status.textContent = choice === 'random' ? 'Generating a surprise puzzle…' : `Generating a ${LEVEL_INFO[level].name} puzzle…`;
    const found = await generate(level, rng, () => left);
    if (left) return;
    busy = false;
    for (const b of buttons) b.disabled = false;
    if (!found) {
      status.textContent = 'That took too long, so nothing was opened. Please try again.';
      return;
    }
    const ref = aiPuzzleRef(level, gridToString(found.puzzle));
    ctx.navigate(`/play/${ref.id}${choice === 'random' ? '?reveal=1' : ''}`);
  }

  const levelButton = (level: LevelId, i: number) => {
    const b = h(
      'button',
      { type: 'button', class: `level-card lvl-${level}`, onClick: () => void start(level) },
      h(
        'div',
        { class: 'level-head' },
        h('span', { class: 'level-dot', 'aria-hidden': 'true' }, String(i + 1)),
        h('div', { class: 'level-names' }, h('h2', { text: LEVEL_INFO[level].name }), h('p', { text: LEVEL_INFO[level].tagline })),
        icon('next', 'icon chevron'),
      ),
    );
    buttons.push(b);
    return b;
  };

  const randomButton = h(
    'button',
    { type: 'button', class: 'card-btn', onClick: () => void start('random') },
    h('span', { class: 'card-icon gold' }, icon('bolt')),
    h('span', { class: 'card-text' }, h('strong', { text: 'Random challenge' }), h('small', { text: 'Any of the five difficulties, revealed when the puzzle starts' })),
    icon('next', 'icon chevron'),
  );
  buttons.push(randomButton);

  const el = h(
    'main',
    { class: 'screen' },
    topBar({ title: 'Sudoku AI', back: () => ctx.back('/') }),
    h(
      'div',
      { class: 'content narrow' },
      h('p', { class: 'muted', text: 'Brand-new puzzles, generated on your device. Each one is checked to have exactly one solution and graded by the techniques it needs, so it matches its difficulty.' }),
      status,
      h('section', null, h('h2', { class: 'section-title', text: 'Choose a difficulty' }), h('div', { class: 'level-list' }, LEVELS.map(levelButton))),
      h('section', null, h('h2', { class: 'section-title', text: 'Random difficulty' }), randomButton),
    ),
  );
  return {
    el,
    title: 'Sudoku AI',
    destroy: () => {
      left = true;
    },
  };
};
