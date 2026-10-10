// Tiny DOM helpers. No framework, no innerHTML for dynamic content.

export type Child = Node | string | number | null | undefined | false | Child[];

export interface Props {
  class?: string;
  text?: string;
  /** CSS custom properties / styles applied via CSSOM (allowed by our CSP). */
  css?: Record<string, string>;
  dataset?: Record<string, string>;
  [attr: string]: unknown;
}

const BOOL_PROPS = new Set(['disabled', 'hidden', 'checked', 'selected', 'open', 'inert']);

export function append(parent: Node, ...children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(parent, ...c);
    else parent.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) applyProps(el, props);
  append(el, ...children);
  return el;
}

function applyProps(el: HTMLElement, props: Props): void {
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'css') for (const [p, val] of Object.entries(v as Record<string, string>)) el.style.setProperty(p, val);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (BOOL_PROPS.has(k)) (el as unknown as Record<string, boolean>)[k] = Boolean(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  return h ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`;
}

export function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h} h ${mins % 60} min`;
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

export function prefersReducedMotion(): boolean {
  return document.documentElement.dataset.motion === 'reduce';
}
