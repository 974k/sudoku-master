import { describe, expect, it } from 'vitest';
import { ancestors, parentRoute, planBack } from './app.ts';

describe('route hierarchy', () => {
  it('matches the parent each screen sends Back to', () => {
    expect(parentRoute('/')).toBeNull();
    expect(parentRoute('/levels')).toBe('/');
    expect(parentRoute('/level/beginner')).toBe('/levels');
    expect(parentRoute('/level/beginner/3')).toBe('/level/beginner');
    expect(parentRoute('/play/medium-3-7')).toBe('/level/medium/3');
    expect(parentRoute('/play/daily-2026-10-09')).toBe('/daily');
    expect(parentRoute('/daily?m=2026-09')).toBe('/');
    expect(parentRoute('/learn/technique/xWing')).toBe('/learn/techniques');
    expect(parentRoute('/learn/rules')).toBe('/learn');
    expect(parentRoute('/tutorial/2')).toBe('/tutorial');
    expect(parentRoute('/tutorial')).toBe('/learn');
    expect(parentRoute('/privacy')).toBe('/settings');
    expect(parentRoute('/settings')).toBe('/');
    expect(ancestors('/play/easy-2-4')).toEqual(['/', '/levels', '/level/easy', '/level/easy/2']);
  });
});

describe('Back', () => {
  it('Beginner returns straight to Choose a level', () => {
    expect(planBack(['/', '/levels', '/level/beginner'], '/levels')).toEqual({ kind: 'go', delta: -1, push: [] });
  });

  it('skips stale entries instead of landing on an unrelated stage screen', () => {
    // a stage page left behind the current Beginner entry by an earlier flow
    const stack = ['/', '/levels', '/level/beginner', '/level/beginner/1', '/level/beginner'];
    expect(planBack(stack, '/levels')).toEqual({ kind: 'go', delta: -3, push: [] });
  });

  it('pops to the latest earlier entry of the target', () => {
    const stack = ['/', '/levels', '/level/beginner', '/level/beginner/1', '/play/beginner-1-1'];
    expect(planBack(stack, '/level/beginner/1')).toEqual({ kind: 'go', delta: -1, push: [] });
  });

  it('keeps the query of the entry it returns to', () => {
    expect(planBack(['/', '/daily?m=2026-09', '/play/daily-2026-09-14'], '/daily')).toEqual({ kind: 'go', delta: -1, push: [] });
  });

  it('rebuilds missing steps after Continue so later Backs climb the hierarchy', () => {
    expect(planBack(['/', '/play/beginner-1-9'], '/level/beginner/1')).toEqual({
      kind: 'go',
      delta: -1,
      push: ['/levels', '/level/beginner', '/level/beginner/1'],
    });
  });

  it('uses the closest ancestor available', () => {
    const stack = ['/', '/levels', '/level/beginner', '/level/beginner/1', '/play/beginner-2-1'];
    expect(planBack(stack, '/level/beginner/2')).toEqual({ kind: 'go', delta: -2, push: ['/level/beginner/2'] });
  });

  it('works from a page opened directly (nothing behind it)', () => {
    expect(planBack(['/level/beginner'], '/levels')).toEqual({ kind: 'replace', routes: ['/', '/levels'] });
    expect(planBack(['/settings'], '/')).toEqual({ kind: 'replace', routes: ['/'] });
  });
});
