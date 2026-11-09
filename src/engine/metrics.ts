import type { RunResult } from "./types";
export function quantile(values: number[], q: number) {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b),
    i = (v.length - 1) * q,
    a = Math.floor(i);
  return v[a] + (v[Math.min(a + 1, v.length - 1)] - v[a]) * (i - a);
}
export function summarize(runs: RunResult[]) {
  const times = runs.flatMap((r) =>
      r.clearance === null ? [] : [r.clearance],
    ),
    n = runs.length,
    success = runs.filter((r) => r.success180).length,
    p = n ? success / n : 0,
    z = 1.96,
    den = 1 + (z * z) / n,
    center = (p + (z * z) / (2 * n)) / den,
    half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return {
    runs: n,
    seeds: runs.map((r) => r.seed),
    resolved: times.length,
    unresolved: n - times.length,
    success180: p,
    successes: success,
    successWilson95: n
      ? [Math.max(0, center - half), Math.min(1, center + half)]
      : null,
    mean: times.length === n && n ? times.reduce((a, b) => a + b, 0) / n : null,
    completedOnlyMean: times.length
      ? times.reduce((a, b) => a + b, 0) / times.length
      : null,
    completedOnlyQuantiles: {
      p10: quantile(times, 0.1),
      median: quantile(times, 0.5),
      p90: quantile(times, 0.9),
    },
    quantilesAreConditional: times.length !== n,
    queueMax: Math.max(0, ...runs.map((r) => r.queueMax)),
  };
}
export function paired(a: RunResult[], b: RunResult[]) {
  const other = new Map(b.map((r) => [r.seed, r]));
  return a.map((r) => {
    const s = other.get(r.seed);
    return {
      seed: r.seed,
      a: r.clearance,
      b: s?.clearance ?? null,
      delta:
        r.clearance !== null && s?.clearance != null
          ? s.clearance - r.clearance
          : null,
      resolvedPair: r.clearance !== null && s?.clearance != null,
    };
  });
}
