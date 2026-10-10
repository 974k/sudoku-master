// Achievements and level badges — earned purely through play.

import { LEVEL_INFO, LEVELS, type LevelId, type PuzzleRef } from './catalog.ts';
import { dailySolved, levelProgress, stagePuzzlesSolved, stageProgress, totalStars, type Profile } from './profile.ts';

export interface WinContext {
  ref: PuzzleRef;
  elapsedMs: number;
  mistakes: number;
  hints: number;
  usedNotes: boolean;
}

export type AchievementIcon = 'trophy' | 'star' | 'bolt' | 'flame' | 'calendar' | 'medal' | 'brain' | 'pencil' | 'book' | 'shield';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: AchievementIcon;
  badge?: LevelId;
  /** Checked after a win (with context) and whenever progress is evaluated. */
  check(p: Profile, ctx?: WinContext): boolean;
  progress?(p: Profile): [number, number];
}

const HARD_LEVELS: readonly LevelId[] = ['hard', 'expert'];

const count = (id: string, title: string, description: string, icon: AchievementIcon, target: number, value: (p: Profile) => number): Achievement => ({
  id,
  title,
  description,
  icon,
  check: (p) => value(p) >= target,
  progress: (p) => [Math.min(value(p), target), target],
});

function anyStage(p: Profile, pred: (solved: number, stars: number) => boolean): boolean {
  for (const l of LEVELS) for (let s = 1; s <= 10; s++) {
    const sp = stageProgress(p, l, s);
    if (pred(sp.solved, sp.stars)) return true;
  }
  return false;
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  count('first-puzzle', 'First Puzzle', 'Solve your first puzzle.', 'trophy', 1, (p) => Object.keys(p.records).length),
  {
    id: 'perfect-game',
    title: 'Perfect Game',
    description: 'Solve a puzzle with no mistakes and no hints.',
    icon: 'shield',
    check: (p, ctx) => (ctx ? ctx.mistakes === 0 && ctx.hints === 0 : Object.values(p.records).some((r) => r.perfect)),
  },
  count('flawless-five', 'Flawless Five', 'Solve 5 puzzles in a row perfectly.', 'shield', 5, (p) => p.bestPerfectRun),
  {
    id: 'expert-solver',
    title: 'Expert Solver',
    description: 'Solve an Expert puzzle.',
    icon: 'brain',
    check: (p, ctx) => ctx?.ref.level === 'expert' || p.levels.expert.won > 0,
  },
  {
    id: 'independent',
    title: 'Independent Thinker',
    description: 'Solve a Hard or Expert puzzle without hints.',
    icon: 'brain',
    check: (_p, ctx) => !!ctx && HARD_LEVELS.includes(ctx.ref.level) && ctx.hints === 0,
  },
  {
    id: 'quick-thinker',
    title: 'Quick Thinker',
    description: 'Solve a Medium or harder puzzle in under 10 minutes.',
    icon: 'bolt',
    check: (_p, ctx) => !!ctx && ['medium', 'hard', 'expert'].includes(ctx.ref.level) && ctx.elapsedMs < 10 * 60_000,
  },
  {
    id: 'lightning',
    title: 'Lightning',
    description: 'Solve any puzzle in under 3 minutes.',
    icon: 'bolt',
    check: (_p, ctx) => !!ctx && ctx.elapsedMs < 3 * 60_000,
  },
  {
    id: 'note-taker',
    title: 'Note Taker',
    description: 'Solve a puzzle using pencil notes.',
    icon: 'pencil',
    check: (_p, ctx) => !!ctx && ctx.usedNotes,
  },
  {
    id: 'never-give-up',
    title: 'Never Give Up',
    description: 'Finish a puzzle after making 3 or more mistakes.',
    icon: 'medal',
    check: (_p, ctx) => !!ctx && ctx.mistakes >= 3,
  },
  {
    id: 'stage-complete',
    title: 'Stage Complete',
    description: 'Solve all 10 puzzles in a stage.',
    icon: 'medal',
    check: (p) => anyStage(p, (solved) => solved === 10),
  },
  {
    id: 'star-stage',
    title: 'Shining Stage',
    description: 'Earn all 30 stars in a stage.',
    icon: 'star',
    check: (p) => anyStage(p, (_s, stars) => stars === 30),
  },
  count('stars-100', 'Star Collector', 'Earn 100 stars.', 'star', 100, totalStars),
  count('stars-500', 'Constellation', 'Earn 500 stars.', 'star', 500, totalStars),
  count('solved-10', 'Getting Started', 'Solve 10 stage puzzles.', 'trophy', 10, stagePuzzlesSolved),
  count('solved-100', 'Centurion', 'Solve 100 stage puzzles.', 'trophy', 100, stagePuzzlesSolved),
  count('solved-250', 'Dedicated', 'Solve 250 stage puzzles.', 'trophy', 250, stagePuzzlesSolved),
  count('solved-500', 'Grandmaster', 'Solve all 500 stage puzzles.', 'trophy', 500, stagePuzzlesSolved),
  count('daily-1', 'Daily Habit', 'Complete a daily challenge.', 'calendar', 1, dailySolved),
  count('daily-7', 'Weekly Regular', 'Complete 7 daily challenges.', 'calendar', 7, dailySolved),
  count('daily-30', 'Daily Devotee', 'Complete 30 daily challenges.', 'calendar', 30, dailySolved),
  count('streak-3', 'On a Roll', 'Solve puzzles 3 days in a row.', 'flame', 3, (p) => p.streak.best),
  count('streak-7', 'Week Warrior', 'Solve puzzles 7 days in a row.', 'flame', 7, (p) => p.streak.best),
  count('streak-30', 'Unstoppable', 'Solve puzzles 30 days in a row.', 'flame', 30, (p) => p.streak.best),
  {
    id: 'student',
    title: 'Student',
    description: 'Finish the interactive tutorial.',
    icon: 'book',
    check: (p) => p.tutorialDone,
  },
  ...LEVELS.map(
    (level): Achievement => ({
      id: `badge-${level}`,
      title: `${LEVEL_INFO[level].name} Badge`,
      description: `Solve all 100 ${LEVEL_INFO[level].name} puzzles.`,
      icon: 'medal',
      badge: level,
      check: (p) => levelProgress(p, level).complete,
      progress: (p) => [levelProgress(p, level).solved, 100],
    }),
  ),
];

export const ACHIEVEMENT_BY_ID: Readonly<Record<string, Achievement>> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Unlock any newly earned achievements (mutates profile); returns the new ones. */
export function evaluateAchievements(p: Profile, ctx?: WinContext, now = Date.now()): Achievement[] {
  const fresh: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (p.achievements[a.id]) continue;
    if (a.check(p, ctx)) {
      p.achievements[a.id] = now;
      fresh.push(a);
    }
  }
  return fresh;
}
