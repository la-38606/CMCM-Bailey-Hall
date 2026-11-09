import { spawn } from "node:child_process";
import { scenarios } from "../src/engine/config";
import { Simulation } from "../src/engine/simulation";
import { paired, summarize } from "../src/engine/metrics";
import { args, integer, save } from "./io";
import type { RunResult } from "../src/engine/types";
const configurations = scenarios(),
  count = integer("runs", 3),
  seed = integer("seed", 101),
  concurrency = integer("jobs", 4),
  summaries: Record<string, unknown> = {},
  all: Record<string, RunResult[]> = {};
if (count < 1 || concurrency < 1)
  throw new Error("runs and jobs must be positive");
for (const [name, c] of Object.entries(configurations))
  await save(`scenarios/${name}.json`, c);
const names = Object.keys(configurations);
let next = 0;
async function work() {
  while (next < names.length) {
    const name = names[next++];
    const runs = await new Promise<RunResult[]>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/experiment-worker.ts",
          name,
          String(seed),
          String(count),
        ],
        { stdio: ["ignore", "pipe", "inherit"] },
      );
      let output = "";
      child.stdout.on("data", (chunk) => (output += chunk));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) reject(new Error(`${name} worker exited ${code}`));
        else
          try {
            resolve(JSON.parse(output));
          } catch (e) {
            reject(e);
          }
      });
    });
    all[name] = runs;
    summaries[name] = summarize(runs);
    await save(`results/${name}.json`, { summary: summarize(runs), runs });
  }
}
await Promise.all(
  Array.from({ length: Math.min(concurrency, names.length) }, work),
);
const coarse = new Simulation(configurations.emergency, seed).run(),
  fine = new Simulation(
    { ...configurations.emergency, dt: 0.0125 },
    seed,
  ).run();
await save("results/refinement.json", { coarse, fine });
await save(args.out ?? "results/experiments.json", {
  summaries: Object.fromEntries(names.map((n) => [n, summaries[n]])),
  pairedToEmergency: Object.fromEntries(
    names.map((n) => [n, paired(all.emergency, all[n])]),
  ),
  refinement: {
    seed,
    coarse: coarse.clearance,
    fine: fine.clearance,
    coarseOutside: coarse.outside,
    fineOutside: fine.outside,
  },
});
console.log(
  `Completed ${names.length * count} replications plus the reference/refinement pair.`,
);
