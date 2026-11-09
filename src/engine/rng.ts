// FNV-1a keyed streams + Mulberry32; no ambient Math.random in the core.
export function hash(value: string): number {
  let h = 2166136261;
  for (const c of value) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export class RNG {
  private state: number;
  constructor(seed: number, name: string) {
    this.state = hash(`${seed}:${name}`);
  }
  uniform() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  normal() {
    return (
      Math.sqrt(-2 * Math.log(Math.max(1e-12, this.uniform()))) *
      Math.cos(2 * Math.PI * this.uniform())
    );
  }
  lognormal(m: number, s: number) {
    return Math.exp(Math.log(m) + s * this.normal());
  }
}
export const draw = (seed: number, key: string) => new RNG(seed, key).uniform();
export const clip = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));
