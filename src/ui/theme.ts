// Applies appearance and accessibility settings to the document.

import type { Settings } from '../game/settings.ts';

const darkQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
const motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
let current: Settings | null = null;

export function resolvedTheme(s: Settings): 'light' | 'dark' | 'sepia' {
  if (s.theme === 'system') return darkQuery?.matches ? 'dark' : 'light';
  return s.theme;
}

export function applyTheme(s: Settings): void {
  current = s;
  const root = document.documentElement;
  const theme = resolvedTheme(s);
  root.dataset.theme = theme;
  root.dataset.text = s.textSize;
  if (s.highContrast) root.dataset.contrast = 'high';
  else delete root.dataset.contrast;
  if (s.reduceMotion || motionQuery?.matches) root.dataset.motion = 'reduce';
  else delete root.dataset.motion;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0f1420' : theme === 'sepia' ? '#f3ead8' : '#f6f4ef');
}

darkQuery?.addEventListener('change', () => current && applyTheme(current));
motionQuery?.addEventListener('change', () => current && applyTheme(current));
