import { parseGrid } from '../../engine/board.ts';
import { gradePuzzle } from '../../engine/grade.ts';
import { TECHNIQUE_BY_ID, type TechniqueId } from '../../engine/logic.ts';
import {
  LEVEL_INFO,
  LEVEL_UNLOCK_STAGES,
  LEVELS,
  PUZZLES_PER_STAGE,
  STAGES_PER_LEVEL,
  isLevel,
  stagePuzzleRef,
  type LevelId,
} from '../../game/catalog.ts';
import { isPuzzleUnlocked, levelProgress, stageProgress } from '../../game/profile.ts';
import type { ScreenFactory } from '../app.ts';
import { progressBar, progressRing, stars, toast, topBar } from '../components.ts';
import { formatTime, h } from '../dom.ts';
import { icon } from '../icons.ts';

export const levelsScreen: ScreenFactory = (ctx) => {
  const { store } = ctx;
  const unlockAll = store.settings.unlockAll;
  const list = h('div', { class: 'level-list' });
  LEVELS.forEach((level, i) => {
    const lp = levelProgress(store.profile, level, unlockAll);
    const info = LEVEL_INFO[level];
    const prev = i > 0 ? LEVEL_INFO[LEVELS[i - 1]!].name : '';
    list.appendChild(
      h(
        'button',
        {
          type: 'button',
          class: `level-card lvl-${level}${lp.unlocked ? '' : ' locked'}`,
          'aria-disabled': lp.unlocked ? undefined : 'true',
          onClick: () => (lp.unlocked ? ctx.navigate(`/level/${level}`) : toast(`Clear ${LEVEL_UNLOCK_STAGES} stages of ${prev} first.`, { icon: 'lock' })),
        },
        h(
          'div',
          { class: 'level-head' },
          h('span', { class: 'level-dot', 'aria-hidden': 'true' }, String(i + 1)),
          h('div', { class: 'level-names' }, h('h2', { text: info.name }), h('p', { text: info.tagline })),
          lp.unlocked ? (lp.complete ? h('span', { class: `badge-pill${lp.gold ? ' gold' : ''}` }, icon('medal'), lp.gold ? 'Gold' : 'Badge') : icon('next', 'icon chevron')) : icon('lock', 'icon lock'),
        ),
        lp.unlocked
          ? h(
              'div',
              { class: 'level-progress' },
              progressBar(lp.solved / 100, `${info.name} progress`),
              h(
                'div',
                { class: 'level-meta' },
                h('span', { text: `${lp.solved}/100 solved` }),
                h('span', { class: 'meta-stars' }, icon('star', 'icon star on'), `${lp.stars}/300`),
              ),
            )
          : h('p', { class: 'lock-note', text: `Clear ${LEVEL_UNLOCK_STAGES} stages of ${prev} to unlock.` }),
      ),
    );
  });

  const el = h(
    'main',
    { class: 'screen' },
    topBar({ title: 'Choose a level', back: () => ctx.back('/') }),
    h('div', { class: 'content' }, list, unlockAll ? h('p', { class: 'notice', text: 'All levels unlocked (Settings → Unlock all levels).' }) : null),
  );
  return { el, title: 'Levels' };
};

// ---------------------------------------------------------------------------

export const stagesScreen: ScreenFactory = (ctx, [levelParam]) => {
  if (!levelParam || !isLevel(levelParam)) throw new Error('bad level');
  const level: LevelId = levelParam;
  const { store } = ctx;
  const unlockAll = store.settings.unlockAll;
  const lp = levelProgress(store.profile, level, unlockAll);
  if (!lp.unlocked) throw new Error('locked');
  const info = LEVEL_INFO[level];

  const grid = h('div', { class: 'stage-grid' });
  for (let s = 1; s <= STAGES_PER_LEVEL; s++) {
    const sp = stageProgress(store.profile, level, s, unlockAll);
    const status = !sp.unlocked ? 'Locked' : sp.complete ? 'Complete' : sp.solved ? `${sp.solved} of 10 solved` : 'Not started';
    grid.appendChild(
      h(
        'button',
        {
          type: 'button',
          class: `stage-card${sp.unlocked ? '' : ' locked'}${sp.complete ? ' complete' : ''}`,
          'aria-label': `Stage ${s}: ${status}${sp.unlocked ? `, ${sp.stars} of 30 stars` : ''}`,
          'aria-disabled': sp.unlocked ? undefined : 'true',
          onClick: () => (sp.unlocked ? ctx.navigate(`/level/${level}/${s}`) : toast(`Complete stage ${s - 1} first.`, { icon: 'lock' })),
        },
        sp.unlocked
          ? progressRing(sp.solved / PUZZLES_PER_STAGE, sp.complete ? icon('check') : h('span', { class: 'ring-num', text: String(s) }), 54)
          : h('div', { class: 'stage-lock' }, icon('lock')),
        h('strong', { text: `Stage ${s}` }),
        sp.unlocked
          ? h('span', { class: 'stage-stars' }, icon('star', 'icon star on'), `${sp.stars}/30`)
          : h('small', { text: `Complete stage ${s - 1}` }),
        h('small', { class: 'stage-status', text: sp.unlocked ? `${sp.solved}/10` : '' }),
      ),
    );
  }

  const el = h(
    'main',
    { class: `screen lvl-${level}` },
    topBar({ title: info.name, subtitle: info.tagline, back: () => ctx.back('/levels') }),
    h(
      'div',
      { class: 'content' },
      h(
        'section',
        { class: 'level-summary' },
        h('p', { text: info.description }),
        h(
          'div',
          { class: 'summary-stats' },
          stat(`${lp.solved}/100`, 'solved'),
          stat(`${lp.stars}/300`, 'stars'),
          stat(`${lp.stagesComplete}/10`, 'stages done'),
        ),
        lp.complete ? h('p', { class: `badge-line${lp.gold ? ' gold' : ''}` }, icon('medal'), `${info.name} Badge earned${lp.gold ? ' — gold, every puzzle perfect!' : ''}`) : null,
      ),
      grid,
      h('p', { class: 'hint-text', text: 'Puzzles open one at a time. Complete a stage to unlock the next one.' }),
    ),
  );
  return { el, title: info.name };
};

function stat(value: string, label: string): HTMLElement {
  return h('div', { class: 'stat' }, h('strong', { text: value }), h('span', { text: label }));
}

// ---------------------------------------------------------------------------

const techniqueCache = new Map<string, TechniqueId[]>();

/** Distinct techniques needed across a stage's puzzles (beyond singles). */
function stageTechniques(level: LevelId, stage: number): string[] {
  const key = `${level}-${stage}`;
  let ids = techniqueCache.get(key);
  if (!ids) {
    const set = new Set<TechniqueId>();
    for (let n = 1; n <= PUZZLES_PER_STAGE; n++) {
      const g = gradePuzzle(parseGrid(stagePuzzleRef(level, stage, n).givens));
      for (const t of Object.keys(g.counts) as TechniqueId[]) set.add(t);
    }
    ids = [...set].sort((a, b) => TECHNIQUE_BY_ID[a].weight - TECHNIQUE_BY_ID[b].weight);
    techniqueCache.set(key, ids);
  }
  return [...new Set(ids.map((t) => TECHNIQUE_BY_ID[t].name))];
}

export const stageScreen: ScreenFactory = (ctx, [levelParam, stageParam]) => {
  if (!levelParam || !isLevel(levelParam)) throw new Error('bad level');
  const level: LevelId = levelParam;
  const stage = Number(stageParam);
  if (!Number.isInteger(stage) || stage < 1 || stage > STAGES_PER_LEVEL) throw new Error('bad stage');
  const { store } = ctx;
  const sp = stageProgress(store.profile, level, stage, store.settings.unlockAll);
  if (!sp.unlocked) throw new Error('locked');
  const info = LEVEL_INFO[level];

  const tiles = h('div', { class: 'puzzle-grid' });
  for (let n = 1; n <= PUZZLES_PER_STAGE; n++) {
    const ref = stagePuzzleRef(level, stage, n);
    const rec = store.profile.records[ref.id];
    const inProgress = store.hasSavedGame(ref.id);
    const open = isPuzzleUnlocked(store.profile, level, stage, n, store.settings.unlockAll);
    if (!open) {
      tiles.appendChild(
        h(
          'button',
          {
            type: 'button',
            class: 'puzzle-tile locked',
            'aria-label': `Puzzle ${n}, locked: solve puzzle ${n - 1} first`,
            'aria-disabled': 'true',
            onClick: () => toast(`Solve puzzle ${n - 1} first.`, { icon: 'lock' }),
          },
          h('span', { class: 'tile-num', text: String(n) }),
          icon('lock', 'icon tile-lock'),
        ),
      );
      continue;
    }
    tiles.appendChild(
      h(
        'button',
        {
          type: 'button',
          class: `puzzle-tile${rec ? ' solved' : ''}${inProgress ? ' active' : ''}`,
          'aria-label': `Puzzle ${n}${rec ? `, solved, ${rec.stars} stars, best ${formatTime(rec.bestMs)}` : inProgress ? ', in progress' : ''}`,
          onClick: () => ctx.navigate(`/play/${ref.id}`),
        },
        h('span', { class: 'tile-num', text: String(n) }),
        rec ? stars(rec.stars) : h('span', { class: 'tile-state', text: inProgress ? 'In progress' : 'New' }),
        rec ? h('small', { class: 'tile-time' }, icon('clock'), formatTime(rec.bestMs)) : inProgress ? h('span', { class: 'active-dot', 'aria-hidden': 'true' }) : null,
      ),
    );
  }

  const techs = stageTechniques(level, stage);
  const el = h(
    'main',
    { class: `screen lvl-${level}` },
    topBar({ title: `Stage ${stage}`, subtitle: info.name, back: () => ctx.back(`/level/${level}`) }),
    h(
      'div',
      { class: 'content' },
      h(
        'section',
        { class: 'stage-summary' },
        progressRing(sp.solved / PUZZLES_PER_STAGE, h('span', { class: 'ring-num', text: `${sp.solved}/10` }), 76, `${sp.solved} of 10 solved`),
        h(
          'div',
          null,
          h('p', { class: 'stage-stars big' }, icon('star', 'icon star on'), `${sp.stars} / 30 stars`),
          h('p', {
            class: 'muted',
            text: sp.complete
              ? 'Stage complete!'
              : stage < STAGES_PER_LEVEL
                ? `Solve ${PUZZLES_PER_STAGE - sp.solved} more to unlock stage ${stage + 1}.`
                : `${PUZZLES_PER_STAGE - sp.solved} puzzles left in the last stage.`,
          }),
        ),
      ),
      tiles,
      h('section', { class: 'tech-list' }, h('h2', { text: 'Techniques in this stage' }), h('p', { class: 'muted', text: techs.join(' · ') })),
    ),
  );
  return { el, title: `${info.name} stage ${stage}` };
};
