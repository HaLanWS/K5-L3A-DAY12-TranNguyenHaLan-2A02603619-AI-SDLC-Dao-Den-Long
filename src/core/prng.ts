/**
 * Deterministic 32-bit PRNG (Mulberry32).
 * Produces identical sequences across all JS runtimes for the same integer seed.
 */
export class SeededPRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Returns a deterministic float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns a deterministic float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniformly samples a 2D point (x, z) inside an annulus [minR, maxR]. */
  pointInRing(minR: number, maxR: number): [number, number] {
    const angle = this.next() * Math.PI * 2;
    const minR2 = minR * minR;
    const maxR2 = maxR * maxR;
    const r = Math.sqrt(minR2 + this.next() * (maxR2 - minR2));
    return [Math.cos(angle) * r, Math.sin(angle) * r];
  }
}
