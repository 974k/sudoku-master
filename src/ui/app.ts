// App shell: hash routing and screen lifecycle.

import type { AppStore } from '../game/store.ts';
import type { Feedback } from './feedback.ts';

export interface Screen {
  el: HTMLElement;
  title: string;
  destroy?: () => void;
}

export interface AppContext {
  store: AppStore;
  feedback: Feedback;
  navigate(path: string, opts?: { replace?: boolean }): void;
  /** Go back within the app, or to `fallback` when there is no in-app history. */
  back(fallback: string): void;
}

export type ScreenFactory = (ctx: AppContext, params: string[], query: URLSearchParams) => Screen;

export interface Route {
  pattern: RegExp;
  screen: ScreenFactory;
}

// ---------------------------------------------------------------------------
// history
//
// Every history entry the app creates remembers the routes of all entries up
// to and including itself (in history.state, which also survives reloads).
// That lets Back return to the real earlier entry for a screen instead of
// stacking replacements, so the browser/phone Back button stays in step too.

const MAX_STACK = 50;

interface NavState {
  sm: 1;
  stack: string[];
}

function isNavState(s: unknown): s is NavState {
  const st = s as NavState | null;
  return !!st && st.sm === 1 && Array.isArray(st.stack) && st.stack.length > 0 && st.stack.every((r) => typeof r === 'string');
}

function currentRoute(): string {
  return location.hash.replace(/^#/, '') || '/';
}

/** A route without its query string ("/daily?m=2026-09" -> "/daily"). */
export function routePath(route: string): string {
  return route.split('?')[0] || '/';
}

/** The screen above a route in the app's hierarchy (null for Home). */
export function parentRoute(route: string): string | null {
  const p = routePath(route);
  if (p === '/') return null;
  let m: RegExpExecArray | null;
  if ((m = /^\/level\/([a-z]+)\/\d+$/.exec(p))) return `/level/${m[1]}`;
  if (/^\/level\/[a-z]+$/.test(p)) return '/levels';
  if (p.startsWith('/play/daily-')) return '/daily';
  if ((m = /^\/play\/([a-z]+)-(\d+)-\d+$/.exec(p))) return `/level/${m[1]}/${m[2]}`;
  if (p.startsWith('/learn/technique/')) return '/learn/techniques';
  if (p.startsWith('/learn/')) return '/learn';
  if (/^\/tutorial\/\d+$/.test(p)) return '/tutorial';
  if (p === '/tutorial') return '/learn';
  if (p === '/privacy') return '/settings';
  return '/';
}

/** Ancestors of a route, Home first (excluding the route itself). */
export function ancestors(route: string): string[] {
  const out: string[] = [];
  for (let p = parentRoute(route); p !== null; p = parentRoute(p)) out.unshift(p);
  return out;
}

export type BackPlan =
  /** Traverse history by `delta` (negative), then push `push` (if any). */
  | { kind: 'go'; delta: number; push: string[] }
  /** Nothing usable behind us: replace the current entry with the first route, push the rest. */
  | { kind: 'replace'; routes: string[] };

/**
 * How to return to `target` from the top of `stack`: pop back to the latest
 * earlier entry for it if there is one; otherwise pop to the closest earlier
 * ancestor and rebuild the missing steps, so later Back presses still climb
 * the hierarchy (e.g. Beginner -> Choose a level -> Home).
 */
export function planBack(stack: readonly string[], target: string): BackPlan {
  const top = stack.length - 1;
  const t = routePath(target);
  for (let j = top - 1; j >= 0; j--) if (routePath(stack[j]!) === t) return { kind: 'go', delta: j - top, push: [] };
  const chain = ancestors(t);
  let best = -1;
  let depth = -1;
  for (let j = top - 1; j >= 0; j--) {
    const d = chain.indexOf(routePath(stack[j]!));
    if (d > depth) {
      depth = d;
      best = j;
    }
  }
  if (best >= 0) return { kind: 'go', delta: best - top, push: [...chain.slice(depth + 1), target] };
  return { kind: 'replace', routes: [...chain, target] };
}

export class App {
  private current: Screen | null = null;
  private rendered: string | null = null;
  private stack: string[];
  /** Entries to push once a pending history traversal lands. */
  private pendingPush: string[] | null = null;
  private root: HTMLElement;
  private routes: Route[];
  readonly ctx: AppContext;

  constructor(root: HTMLElement, routes: Route[], store: AppStore, feedback: Feedback) {
    this.root = root;
    this.routes = routes;
    this.ctx = {
      store,
      feedback,
      navigate: (path, opts) => this.navigate(path, opts),
      back: (fallback) => this.back(fallback),
    };
    const route = currentRoute();
    const st: unknown = history.state;
    this.stack = isNavState(st) && st.stack[st.stack.length - 1] === route ? st.stack : [route];
    history.replaceState({ sm: 1, stack: this.stack } satisfies NavState, '', location.href);
    // Hash navigation fires both events; the handler is idempotent.
    window.addEventListener('popstate', () => this.onHistoryChange());
    window.addEventListener('hashchange', () => this.onHistoryChange());
  }

  navigate(path: string, opts: { replace?: boolean } = {}): void {
    this.pendingPush = null;
    if (currentRoute() === path) {
      this.render();
      return;
    }
    this.write(path, opts.replace ? 'replace' : 'push');
    this.render();
  }

  /** Return to `target` (the screen above the current one). */
  private back(target: string): void {
    const plan = planBack(this.stack, target);
    if (plan.kind === 'replace') {
      plan.routes.forEach((r, i) => this.write(r, i === 0 ? 'replace' : 'push'));
      this.render();
      return;
    }
    this.pendingPush = plan.push;
    history.go(plan.delta);
  }

  private write(route: string, mode: 'push' | 'replace'): void {
    this.stack = mode === 'push' ? [...this.stack, route].slice(-MAX_STACK) : [...this.stack.slice(0, -1), route];
    const state: NavState = { sm: 1, stack: this.stack };
    if (mode === 'push') history.pushState(state, '', `#${route}`);
    else history.replaceState(state, '', `#${route}`);
  }

  private onHistoryChange(): void {
    const route = currentRoute();
    const st: unknown = history.state;
    if (isNavState(st) && st.stack[st.stack.length - 1] === route) {
      this.stack = st.stack; // moved to an entry we created (Back/Forward)
    } else {
      // a new entry made outside navigate(): a link click or an edited URL
      this.stack = [...this.stack, route].slice(-MAX_STACK);
      history.replaceState({ sm: 1, stack: this.stack } satisfies NavState, '', location.href);
    }
    if (this.pendingPush) {
      const push = this.pendingPush;
      this.pendingPush = null;
      for (const r of push) this.write(r, 'push');
      this.render();
      return;
    }
    if (currentRoute() !== this.rendered) this.render();
  }

  render(): void {
    const raw = currentRoute();
    const [path, qs] = raw.split('?') as [string, string | undefined];
    const query = new URLSearchParams(qs ?? '');
    let screen: Screen | null = null;
    for (const r of this.routes) {
      const m = r.pattern.exec(path);
      if (!m) continue;
      try {
        screen = r.screen(this.ctx, m.slice(1).map(decodeURIComponent), query);
      } catch (e) {
        console.error(e);
        screen = null;
      }
      break;
    }
    if (!screen) {
      // unknown or invalid route: go home
      if (path !== '/') {
        this.write('/', 'replace');
        this.render();
      }
      return;
    }
    this.current?.destroy?.();
    this.root.replaceChildren(screen.el);
    this.current = screen;
    this.rendered = raw;
    document.title = screen.title === 'Sudoku Master' ? screen.title : `${screen.title} · Sudoku Master`;
    window.scrollTo(0, 0);
    // move focus to the screen heading for keyboard and screen-reader users
    const heading = screen.el.querySelector<HTMLElement>('h1');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
  }
}
