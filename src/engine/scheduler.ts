// Integer tick counter prevents accumulating floating-point clock drift.
export class Scheduler {
  tick = 0;
  constructor(public dt: number) {}
  get time() {
    return Number((this.tick * this.dt).toFixed(8));
  }
  advance() {
    this.tick++;
  }
}
