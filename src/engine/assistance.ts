import { RNG } from "./rng";
import type { Person } from "./types";
export class Assistance {
  teams = [60, 60];
  constructor(private seed: number) {}
  assign(p: Person, time: number) {
    const team = this.teams[0] <= this.teams[1] ? 0 : 1,
      start = Math.max(time, this.teams[team]);
    const duration = new RNG(this.seed, `assistance:${p.id}`).lognormal(
      60,
      0.4,
    );
    p.streetTime = start + duration;
    this.teams[team] = p.streetTime;
    return { team, start, end: p.streetTime };
  }
}
