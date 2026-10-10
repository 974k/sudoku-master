// Draws the app icons (PNG + SVG) procedurally — no image tools or assets.
//
//   npm run icons
//
// A tiny PNG encoder (zlib from Node) with 4×4 supersampling for smooth edges.

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = new URL('../public/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const BG_A = [59, 85, 212]; // accent
const BG_B = [128, 90, 235];
const BOARD = [255, 255, 255];
const LINE = [59, 85, 212];
const GOLD = [242, 176, 30];
const CELL = [228, 233, 253];

/** Signed-distance test for a rounded rectangle (coordinates in 0..1). */
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

const HIGHLIGHT = new Set(['0,0', '1,1', '2,2']);
const SOFT = new Set(['0,2', '2,0']);

/** Colour at a point, or null for transparent. `maskable` fills the full square. */
function sample(x, y, maskable) {
  // content is scaled into the maskable safe zone (inner 80%)
  const s = maskable ? 0.8 : 1;
  const u = (x - 0.5) / s + 0.5;
  const v = (y - 0.5) / s + 0.5;
  const t = (x + y) / 2;
  const bg = BG_A.map((a, i) => Math.round(a + (BG_B[i] - a) * t));
  if (!maskable && !inRoundRect(x, y, 0, 0, 1, 1, 0.22)) return null;
  const b0 = 0.19;
  const b1 = 0.81;
  if (!inRoundRect(u, v, b0, b0, b1, b1, 0.07)) return bg;
  const size = (b1 - b0) / 3;
  const gx = Math.min(2, Math.floor((u - b0) / size));
  const gy = Math.min(2, Math.floor((v - b0) / size));
  const lx = (u - b0) / size - gx;
  const ly = (v - b0) / size - gy;
  const edge = 0.075;
  if ((gx > 0 && lx < edge) || (gx < 2 && lx > 1 - edge) || (gy > 0 && ly < edge) || (gy < 2 && ly > 1 - edge)) return LINE;
  const key = `${gx},${gy}`;
  if (HIGHLIGHT.has(key) && inRoundRect(lx, ly, 0.2, 0.2, 0.8, 0.8, 0.14)) return GOLD;
  if (SOFT.has(key) && inRoundRect(lx, ly, 0.2, 0.2, 0.8, 0.8, 0.14)) return CELL;
  return BOARD;
}

function render(size, maskable) {
  const px = Buffer.alloc(size * size * 4);
  const N = 4;
  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const c = sample((pxi + (sx + 0.5) / N) / size, (py + (sy + 0.5) / N) / size, maskable);
          if (!c) continue;
          r += c[0];
          g += c[1];
          b += c[2];
          a++;
        }
      }
      const o = (py * size + pxi) * 4;
      if (a) {
        px[o] = Math.round(r / a);
        px[o + 1] = Math.round(g / a);
        px[o + 2] = Math.round(b / a);
      }
      px[o + 3] = Math.round((a / (N * N)) * 255);
    }
  }
  return encodePng(size, size, px);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(new URL('icon-192.png', OUT), render(192, false));
writeFileSync(new URL('icon-512.png', OUT), render(512, false));
writeFileSync(new URL('icon-maskable-512.png', OUT), render(512, true));

// Matching SVG (favicon / scalable icon)
const cells = [];
const b0 = 19, size = 62 / 3;
for (let gy = 0; gy < 3; gy++) {
  for (let gx = 0; gx < 3; gx++) {
    const key = `${gx},${gy}`;
    const fill = HIGHLIGHT.has(key) ? '#f2b01e' : SOFT.has(key) ? '#e4e9fd' : null;
    if (fill) cells.push(`<rect x="${(b0 + gx * size + size * 0.2).toFixed(2)}" y="${(b0 + gy * size + size * 0.2).toFixed(2)}" width="${(size * 0.6).toFixed(2)}" height="${(size * 0.6).toFixed(2)}" rx="2.9" fill="${fill}"/>`);
  }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b55d4"/><stop offset="1" stop-color="#805aeb"/></linearGradient></defs>
<rect width="100" height="100" rx="22" fill="url(#g)"/>
<rect x="19" y="19" width="62" height="62" rx="7" fill="#fff"/>
${cells.join('\n')}
<path d="M${(b0 + size).toFixed(2)} 19v62M${(b0 + 2 * size).toFixed(2)} 19v62M19 ${(b0 + size).toFixed(2)}h62M19 ${(b0 + 2 * size).toFixed(2)}h62" stroke="#3b55d4" stroke-width="3.1"/>
</svg>
`;
writeFileSync(new URL('icon.svg', OUT), svg);
console.log('icons written to public/icons/');
