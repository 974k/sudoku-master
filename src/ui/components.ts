// Shared UI building blocks.

import { h, type Child } from './dom.ts';
import { icon, type IconName } from './icons.ts';

export function iconButton(name: IconName, label: string, onClick: (e: MouseEvent) => void, cls = 'icon-btn'): HTMLButtonElement {
  return h('button', { type: 'button', class: cls, 'aria-label': label, title: label, onClick }, icon(name));
}

export interface TopBarOptions {
  title: string;
  subtitle?: string;
  back?: () => void;
  backLabel?: string;
  actions?: Child[];
}

export function topBar(o: TopBarOptions): HTMLElement {
  return h(
    'header',
    { class: 'topbar' },
    h('div', { class: 'topbar-side' }, o.back ? iconButton('back', o.backLabel ?? 'Back', o.back) : null),
    h('div', { class: 'topbar-title' }, h('h1', { text: o.title }), o.subtitle ? h('p', { class: 'topbar-sub', text: o.subtitle }) : null),
    h('div', { class: 'topbar-side end' }, o.actions ?? null),
  );
}

export function stars(count: number, max = 3, cls = 'stars'): HTMLElement {
  const el = h('span', { class: cls, role: 'img', 'aria-label': `${count} of ${max} stars` });
  for (let i = 0; i < max; i++) el.appendChild(icon(i < count ? 'star' : 'starOutline', i < count ? 'icon star on' : 'icon star'));
  return el;
}

/** Circular progress indicator with centered content. */
export function progressRing(fraction: number, content: Child, size = 56, label?: string): HTMLElement {
  const NS = 'http://www.w3.org/2000/svg';
  const r = 22;
  const circ = 2 * Math.PI * r;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 52 52');
  svg.setAttribute('class', 'ring-svg');
  svg.setAttribute('aria-hidden', 'true');
  const track = document.createElementNS(NS, 'circle');
  const bar = document.createElementNS(NS, 'circle');
  for (const c of [track, bar]) {
    c.setAttribute('cx', '26');
    c.setAttribute('cy', '26');
    c.setAttribute('r', String(r));
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke-width', '5');
  }
  track.setAttribute('class', 'ring-track');
  bar.setAttribute('class', 'ring-bar');
  bar.setAttribute('stroke-linecap', 'round');
  bar.setAttribute('stroke-dasharray', `${circ}`);
  bar.setAttribute('stroke-dashoffset', `${circ * (1 - Math.max(0, Math.min(1, fraction)))}`);
  bar.setAttribute('transform', 'rotate(-90 26 26)');
  svg.append(track, bar);
  return h(
    'div',
    { class: 'ring', css: { '--ring-size': `${size}px` }, role: label ? 'img' : undefined, 'aria-label': label },
    svg,
    h('div', { class: 'ring-content' }, content),
  );
}

export function progressBar(fraction: number, label: string): HTMLElement {
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  return h(
    'div',
    { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': label },
    h('div', { class: 'bar-fill', css: { width: `${pct}%` } }),
  );
}

export function toggle(checked: boolean, onChange: (v: boolean) => void, label: string): HTMLButtonElement {
  const btn = h('button', {
    type: 'button',
    role: 'switch',
    class: 'switch',
    'aria-checked': String(checked),
    'aria-label': label,
  });
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-checked') !== 'true';
    btn.setAttribute('aria-checked', String(next));
    onChange(next);
  });
  return btn;
}

export function segmented<T extends string | number>(
  options: readonly { value: T; label: string }[],
  value: T,
  onChange: (v: T) => void,
  label: string,
): HTMLElement {
  const group = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label });
  const buttons = options.map((o) => {
    const b = h('button', {
      type: 'button',
      role: 'radio',
      'aria-checked': String(o.value === value),
      text: o.label,
      onClick: () => {
        for (const x of buttons) x.setAttribute('aria-checked', String(x === b));
        onChange(o.value);
      },
    });
    return b;
  });
  // arrow-key navigation inside the radio group
  group.addEventListener('keydown', (e) => {
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = buttons[(i + d + buttons.length) % buttons.length]!;
    next.focus();
    next.click();
  });
  group.append(...buttons);
  return group;
}

// ---------------------------------------------------------------------------
// dialogs

export interface ConfirmOptions {
  title: string;
  message: string;
  confirm?: string;
  cancel?: string;
  danger?: boolean;
}

export function confirmDialog(o: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'dialog', 'aria-labelledby': 'dlg-title' });
    const done = (v: boolean) => {
      dlg.close();
      dlg.remove();
      resolve(v);
    };
    dlg.append(
      h('h2', { id: 'dlg-title', text: o.title }),
      h('p', { text: o.message }),
      h(
        'div',
        { class: 'dialog-actions' },
        h('button', { type: 'button', class: 'btn ghost', text: o.cancel ?? 'Cancel', onClick: () => done(false) }),
        h('button', { type: 'button', class: o.danger ? 'btn danger' : 'btn primary', text: o.confirm ?? 'OK', onClick: () => done(true) }),
      ),
    );
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      done(false);
    });
    document.body.appendChild(dlg);
    dlg.showModal();
    (dlg.querySelector('.btn.ghost') as HTMLButtonElement | null)?.focus();
  });
}

export interface MenuItem {
  icon: IconName;
  label: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  action: () => void;
}

/** A modal action sheet. */
export function actionSheet(title: string, items: MenuItem[]): void {
  const dlg = h('dialog', { class: 'dialog sheet', 'aria-label': title });
  const close = () => {
    dlg.close();
    dlg.remove();
  };
  dlg.append(
    h('h2', { class: 'sheet-title', text: title }),
    h(
      'div',
      { class: 'sheet-items' },
      items.map((it) =>
        h(
          'button',
          {
            type: 'button',
            class: it.danger ? 'sheet-item danger' : 'sheet-item',
            disabled: it.disabled,
            onClick: () => {
              close();
              it.action();
            },
          },
          icon(it.icon),
          h('span', { class: 'sheet-label' }, it.label, it.hint ? h('small', { text: it.hint }) : null),
        ),
      ),
    ),
    h('button', { type: 'button', class: 'btn ghost block', text: 'Close', onClick: close }),
  );
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) close();
  });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
}

// ---------------------------------------------------------------------------
// toasts

let toastHost: HTMLElement | null = null;

export function toast(message: string, opts: { icon?: IconName; title?: string; ms?: number } = {}): void {
  if (!toastHost) {
    toastHost = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(toastHost);
  }
  const el = h(
    'div',
    { class: 'toast' },
    opts.icon ? icon(opts.icon, 'icon toast-icon') : null,
    h('div', null, opts.title ? h('strong', { text: opts.title }) : null, h('span', { text: message })),
  );
  toastHost.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 400);
  }, opts.ms ?? 3200);
}

/** Visually hidden live region for screen-reader announcements. */
let liveRegion: HTMLElement | null = null;
export function announce(message: string): void {
  if (!liveRegion) {
    liveRegion = h('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
    document.body.appendChild(liveRegion);
  }
  liveRegion.textContent = '';
  setTimeout(() => (liveRegion!.textContent = message), 30);
}
