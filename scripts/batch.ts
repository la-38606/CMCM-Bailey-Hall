import { Simulation } from "../src/engine/simulation";
import { summarize, paired } from "../src/engine/metrics";
import { args, config, integer, save } from "./io";
import { readFile } from "node:fs/promises";
const c = await config(),
  seed = integer("seed", 1),
  count = integer("runs", 5);
if (count < 1) throw new Error("runs must be positive");
const runs = [];
for (let i = 0; i < count; i++) {
  const r = new Simulation(c, seed + i).run();
  runs.push(r);
  console.log(
    `${i + 1}/${count}: seed ${seed + i}, ${r.clearanceBound}, ${r.outside}/1329 outside`,
  );
}
const compare = args.compare
  ? JSON.parse(await readFile(args.compare, "utf8"))
  : null;
const comparison = compare
  ? runs.map((r) => new Simulation(compare, r.seed).run())
  : null;
const result = {
  summary: summarize(runs),
  runs,
  comparison: comparison
    ? {
        summary: summarize(comparison),
        pairs: paired(runs, comparison),
        runs: comparison,
      }
    : null,
};
await save(args.out ?? "results/batch.json", result);
console.log(JSON.stringify(result.summary, null, 2));
