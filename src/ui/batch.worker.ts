import { Simulation } from "../engine/simulation";
import { paired, summarize } from "../engine/metrics";
import type { Config, RunResult } from "../engine/types";
self.onmessage = (
  event: MessageEvent<{
    config: Config;
    compare: Config;
    seed: number;
    runs: number;
  }>,
) => {
  try {
    const { config, compare, seed, runs } = event.data,
      a: RunResult[] = [],
      b: RunResult[] = [];
    for (let i = 0; i < runs; i++) {
      a.push(new Simulation(config, seed + i).run());
      b.push(new Simulation(compare, seed + i).run());
      self.postMessage({ progress: i + 1, total: runs });
    }
    self.postMessage({
      done: true,
      summary: summarize(a),
      comparison: summarize(b),
      pairs: paired(a, b),
      runs: a,
      comparisonRuns: b,
    });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
