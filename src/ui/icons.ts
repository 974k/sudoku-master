// Inline SVG icons (drawn for this project; no icon library or external files).

type Shape =
  | ['path', string]
  | ['circle', number, number, number]
  | ['rect', number, number, number, number, number];

interface IconDef {
  shapes: Shape[];
  fill?: boolean;
}

const ICONS = {
  back: { shapes: [['path', 'M15 18l-6-6 6-6']] },
  next: { shapes: [['path', 'M9 18l6-6-6-6']] },
  pause: { shapes: [['path', 'M7 5h3v14H7zM14 5h3v14h-3z']], fill: true },
  play: { shapes: [['path', 'M7 4.5l12.5 7.5L7 19.5z']], fill: true },
  more: { shapes: [['circle', 12, 5, 1.6], ['circle', 12, 12, 1.6], ['circle', 12, 19, 1.6]], fill: true },
  undo: { shapes: [['path', 'M9 14L4 9l5-5'], ['path', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11']] },
  redo: { shapes: [['path', 'M15 14l5-5-5-5'], ['path', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13']] },
  eraser: {
    shapes: [
      ['path', 'M8 21h12'],
      ['path', 'M4.6 13.4l8.8-8.8a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L12 18H8.2a2 2 0 0 1-1.4-.6l-2.2-2.2a2 2 0 0 1 0-2.8z'],
      ['path', 'M9.5 8.5l6 6'],
    ],
  },
  pencil: { shapes: [['path', 'M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16l-1 4z'], ['path', 'M14 7l3 3']] },
  bulb: {
    shapes: [
      ['path', 'M9 18h6'],
      ['path', 'M10 21h4'],
      ['path', 'M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z'],
    ],
  },
  home: { shapes: [['path', 'M3 11l9-7 9 7'], ['path', 'M5 10v10h5v-6h4v6h5V10']] },
  sliders: {
    shapes: [
      ['path', 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1'],
      ['circle', 15, 6, 2],
      ['circle', 9, 12, 2],
      ['circle', 17, 18, 2],
    ],
  },
  chart: { shapes: [['path', 'M5 20V11M11 20V5M17 20v-6M3 20h18']] },
  calendar: { shapes: [['rect', 3, 5, 18, 16, 2], ['path', 'M3 10h18M8 3v4M16 3v4']] },
  book: {
    shapes: [
      ['path', 'M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2z'],
      ['path', 'M22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z'],
    ],
  },
  trophy: {
    shapes: [
      ['path', 'M8 21h8M12 16v5'],
      ['path', 'M7 4h10v5a5 5 0 0 1-10 0z'],
      ['path', 'M17 6h3v1a3 3 0 0 1-3 3M7 6H4v1a3 3 0 0 0 3 3'],
    ],
  },
  star: { shapes: [['path', 'M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z']], fill: true },
  starOutline: { shapes: [['path', 'M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z']] },
  lock: { shapes: [['rect', 5, 11, 14, 10, 2], ['path', 'M8 11V7a4 4 0 0 1 8 0v4']] },
  check: { shapes: [['path', 'M5 12.5l4.5 4.5L19 7']] },
  flame: {
    shapes: [
      ['path', 'M12 22c4 0 7-2.8 7-7 0-3-1.6-5.4-3.5-7.3.1 2-1 3.3-2.3 3.8C13.5 8 12.5 4.5 9.5 2c.4 3.5-1.6 5.6-3.2 7.6A8.6 8.6 0 0 0 5 15c0 4.2 3 7 7 7z'],
    ],
  },
  bolt: { shapes: [['path', 'M13 2L4 14h7l-1 8 9-12h-7z']] },
  medal: { shapes: [['circle', 12, 15, 6], ['path', 'M8.5 10.5L5 2h4l3 6 3-6h4l-3.5 8.5'], ['path', 'M12 12.5v5']] },
  target: { shapes: [['circle', 12, 12, 9], ['circle', 12, 12, 5], ['circle', 12, 12, 1]] },
  shield: { shapes: [['path', 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z'], ['path', 'M8.5 12l2.5 2.5 4.5-5']] },
  restart: { shapes: [['path', 'M20 12a8 8 0 1 1-2.4-5.7'], ['path', 'M20 4v5h-5']] },
  close: { shapes: [['path', 'M6 6l12 12M18 6L6 18']] },
  info: { shapes: [['circle', 12, 12, 9], ['path', 'M12 11v6M12 7.5v.5']] },
  clock: { shapes: [['circle', 12, 12, 9], ['path', 'M12 7v5l3 2']] },
  grid: { shapes: [['rect', 3, 3, 18, 18, 3], ['path', 'M9 3v18M15 3v18M3 9h18M3 15h18']] },
  dots: { shapes: [['path', 'M6 6h.01M12 6h.01M18 6h.01M6 12h.01M12 12h.01M18 12h.01M6 18h.01M12 18h.01M18 18h.01']] },
  brain: {
    shapes: [
      ['path', 'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1z'],
      ['path', 'M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1'],
    ],
  },
  pencilNotes: { shapes: [['path', 'M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16l-1 4z'], ['path', 'M3 4h.01M7 4h.01M3 8h.01']] },
} satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICONS;

const NS = 'http://www.w3.org/2000/svg';

export function icon(name: IconName, cls = 'icon'): SVGSVGElement {
  const def: IconDef = ICONS[name];
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', def.fill ? 'currentColor' : 'none');
  svg.setAttribute('stroke', def.fill ? 'none' : 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const shape of def.shapes) {
    let el: SVGElement;
    if (shape[0] === 'path') {
      el = document.createElementNS(NS, 'path');
      el.setAttribute('d', shape[1]);
    } else if (shape[0] === 'circle') {
      el = document.createElementNS(NS, 'circle');
      el.setAttribute('cx', String(shape[1]));
      el.setAttribute('cy', String(shape[2]));
      el.setAttribute('r', String(shape[3]));
    } else {
      el = document.createElementNS(NS, 'rect');
      el.setAttribute('x', String(shape[1]));
      el.setAttribute('y', String(shape[2]));
      el.setAttribute('width', String(shape[3]));
      el.setAttribute('height', String(shape[4]));
      el.setAttribute('rx', String(shape[5]));
    }
    svg.appendChild(el);
  }
  return svg;
}
