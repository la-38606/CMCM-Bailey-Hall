import { scenarios } from "../src/engine/config";
import { Simulation } from "../src/engine/simulation";
const [name, first, count] = process.argv.slice(2),
  c = scenarios()[name],
  runs = [];
for (let i = 0; i < Number(count); i++) {
  const seed = Number(first) + i,
    start = performance.now(),
    { events, ...r } = new Simulation(c, seed).run();
  runs.push({ ...r, eventCount: events.length });
  process.stderr.write(
    `${name} seed=${seed}: ${r.clearanceBound}, ${r.outside}/1329 (${((performance.now() - start) / 1000).toFixed(2)} wall s)\n`,
  );
}
process.stdout.write(JSON.stringify(runs));
