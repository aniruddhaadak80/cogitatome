/**
 * Deterministic randomness.
 *
 * Every stochastic part of cogitatome must be reproducible, so all of it goes
 * through here. `mulberry32` is the generator for the app; `splitmix64` gives
 * the bits used to seed tensor initialisation. Neither touches `Math.random`.
 */

/** mulberry32 — small, fast, good enough for initialising model weights. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** splitmix64, expressed with a pair of 32-bit halves so it stays exact. */
export function splitmix64(seed: number): () => number {
  let state = BigInt(seed) & 0xffffffffffffffffn;
  return () => {
    state = (state + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
    let z = state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
    z = z ^ (z >> 31n);
    return Number(z & 0xffffffffn) / 2 ** 32;
  };
}

/** A small deterministic toolkit built on one of the generators above. */
export class Rng {
  private readonly next: () => number;
  readonly seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.next = mulberry32(this.seed);
  }

  float(): number {
    return this.next();
  }

  range(n: number): number {
    if (n <= 0) return 0;
    return Math.floor(this.next() * n) % n;
  }

  between(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Box–Muller normal sample. */
  normal(mean = 0, std = 1): number {
    const u = Math.max(1e-12, this.next());
    const v = this.next();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean + std * z;
  }

  /** Uniform in (-s, s). */
  symmetric(s: number): number {
    return (this.next() * 2 - 1) * s;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = this.range(i + 1);
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError("Rng.pick: empty list");
    return items[this.range(items.length)] as T;
  }
}

/** Stable hash of a string to a 32-bit seed — same string, same model. */
export function seedFromString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
