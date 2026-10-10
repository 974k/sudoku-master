// Small deterministic PRNG (sfc32) so puzzle generation and daily transforms
// are reproducible from a seed on every device.

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, n). */
  int(n: number): number;
  shuffle<T>(arr: T[]): T[];
}

function hashSeed(seed: number | string): [number, number, number, number] {
  // xmur3-style string/number hash to four 32-bit words
  const s = String(seed);
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const out: number[] = [];
  for (let k = 0; k < 4; k++) {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    out.push(h >>> 0);
  }
  return out as [number, number, number, number];
}

export function createRng(seed: number | string): Rng {
  let [a, b, c, d] = hashSeed(seed);
  const next = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  // discard the first few outputs to decorrelate similar seeds
  for (let i = 0; i < 12; i++) next();
  return {
    next,
    int: (n) => Math.floor(next() * n),
    shuffle<T>(arr: T[]): T[] {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = arr[i]!;
        arr[i] = arr[j]!;
        arr[j] = tmp;
      }
      return arr;
    },
  };
}
