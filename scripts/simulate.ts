import { Simulation } from "../src/engine/simulation";
import { args, config, integer, save } from "./io";
const start = performance.now(),
  sim = new Simulation(await config(), integer("seed", 1)),
  result = sim.run();
await save(args.out ?? "results/run.json", result);
console.log(
  JSON.stringify(
    {
      seed: result.seed,
      status: result.status,
      clearance: result.clearanceBound,
      streetClearance: result.streetClearance,
      outside: result.outside,
      success180: result.success180,
      seconds: (performance.now() - start) / 1000,
    },
    null,
    2,
  ),
);
