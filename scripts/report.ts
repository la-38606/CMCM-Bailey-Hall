import { gunzipSync } from "node:zlib";
import { readFile, writeFile } from "node:fs/promises";
import { scenarios, reference } from "../src/engine/config";
import { buildGeometry } from "../src/engine/geometry";
import { summarize } from "../src/engine/metrics";
import type { RunResult } from "../src/engine/types";
const read = async (path: string) =>
  JSON.parse(
    await readFile(path, "utf8").catch(async (error) => {
      if (error.code !== "ENOENT") throw error;
      return gunzipSync(await readFile(path + ".gz")).toString("utf8");
    }),
  );
const experiments = await read("results/experiments.json"),
  refinement = (await read("results/refinement.json")) as {
    coarse: RunResult;
    fine: RunResult;
  },
  configs = scenarios(),
  g = buildGeometry(reference());
const f = (v: number | null) => (v === null ? "—" : v.toFixed(1)),
  rows: string[] = [],
  censored: string[] = [];
for (const [key, c] of Object.entries(configs)) {
  const { runs } = (await read(`results/${key}.json`)) as { runs: RunResult[] },
    s = summarize(runs);
  rows.push(
    `| ${c.name} | ${runs.map((r) => (r.clearance === null ? ">900" : f(r.clearance))).join(", ")} | ${s.resolved}/${s.runs} | ${f(s.mean)} | ${f(s.completedOnlyQuantiles.median)} | ${s.successes}/${s.runs} | ${s.queueMax} |`,
  );
  for (const r of runs.filter((r) => r.clearance === null)) {
    const held = Object.entries(r.linkHistory)
      .filter(([, h]) => h.at(-1)![1] > 0)
      .sort((a, b) => b[1].at(-1)![1] - a[1].at(-1)![1])
      .slice(0, 4)
      .map(([id, h]) => `${id} (${h.at(-1)![1]})`)
      .join(", ");
    censored.push(
      `- ${key}, seed ${r.seed}: ${r.outside}/1329 outside, ${1329 - r.outside} inside at 900 s. Remaining occupancy includes ${held}.`,
    );
  }
}
const a = refinement.coarse,
  b = refinement.fine,
  delta =
    a.clearance !== null && b.clearance !== null
      ? b.clearance - a.clearance
      : null;
const exits = Object.keys(a.exitUsage)
  .map(
    (e) =>
      `| ${e} | ${a.exitUsage[e as keyof typeof a.exitUsage]} | ${b.exitUsage[e as keyof typeof b.exitUsage]} |`,
  )
  .join("\n");
const accessible = a.accessible
  .map((p) => `| ${p.id} | ${f(p.exitTime)} | ${f(p.streetTime)} |`)
  .join("\n");
const s = experiments.summaries.emergency;
await writeFile(
  "docs/validation.md",
  `# Validation and experiment report

Recorded 9 November 2026. This report describes executed checks and generated results, not predicted outcomes from the paper. The supplied mathematical paper is unchanged. All work uses the rebuild branch.

## Executed checks

- \`npm run typecheck\`: passed.
- \`npm test\`: 35 tests passed in two files. They cover section counts and wheelchair inclusion; independent streams; geometry topology and provenance; restricted rows and stepped cross-aisles; body fit; finite shared lanes, continuous lane assignment and atomic returns; door/stair rates; fractional credits; conservation, spillback and positive travel; local closure learning; sightlines and persistent sign rejection; public reporting delays and holding times; assistance; censoring; and numerical refinement.
- \`npm run build\`: TypeScript and the Vite production build passed.
- \`npm run test:browser\`: three Chrome tests passed. They cover loading, play/pause/step, both floors, geometry inspection, saving, invalid-barrier feedback, a 390 px viewport, paired worker batches, JSON export and deterministic replay. Complete worker results match the Node engine for the same configuration and seed.
- The engine test additionally compares all events and metrics from a browser-targeted bundle, the direct Node module and the actual \`simulate\` CLI.
- \`npm run simulate -- --config scenarios/emergency.json --seed 101 --out results/reference-run.json\`: executed.
- \`npm run batch -- --config scenarios/emergency.json --compare scenarios/concert.json --seed 101 --runs 1 --out results/paired-smoke.json\`: executed.
- \`npm run experiments -- --seed 101 --runs 3 --jobs 4\`: executed. Four independent Node processes only change scheduling, not seed enumeration or outcomes.

The installed Node version was 22.23.1. A final standalone reference CLI run took 7.6 wall-clock seconds while refinement was running. Concurrent policy-run times varied with load; this is a development observation, not a controlled speed benchmark. A live Vite application was exercised by Chrome; desktop and mobile screenshots are retained in \`results/\`.

## Three-seed policy comparisons

Each named case uses seeds 101, 102 and 103. Intervention-only comparisons retain all fixed audience draws. Sensitivity cases deliberately alter their stated audience parameters. All runs use 0.1 s steps and a 900 s observation horizon. No speed, width, response or population value was adjusted to obtain a 180-second clearance.

| Scenario | Clearance by seed 101, 102, 103 · s | Resolved | All-run mean · s | Completed-only median · s | ≤180 s | Maximum link queue |
| --- | --- | --- | --- | --- | --- | --- |
${rows.join("\n")}

The six-manager reference mean is **${f(s.mean)} s**, median **${f(s.completedOnlyQuantiles.median)} s**, with **${s.successes}/${s.runs}** successes by 180 s. Its 95% Wilson success interval is ${s.successWilson95.map((v: number) => (100 * v).toFixed(1) + "%").join("–")}; three seeds cannot establish a reliable success probability. Completed-only medians in censored rows are conditional, not a full clearance distribution. The all-run mean is absent for those rows. Detailed quantiles, paired differences, denominators and seeds are in [experiments.json](../results/experiments.json).

Manager counts, signs and barriers are not assumed to improve outcomes. Results reflect the particular public messages, posts and interaction rules tested; they are not an optimization of staffing or a recommendation to remove staff.

## Numerical refinement

The same emergency configuration and seed 101 were rerun with the finer interval; all other parameters stayed fixed.

| Interval | Building clearance · s | Street clearance · s | Exterior count | Peak link queue |
| --- | --- | --- | --- | --- |
| 0.1 s | ${f(a.clearance)} | ${f(a.streetClearance)} | ${a.outside} | ${a.queueMax} |
| 0.0125 s | ${f(b.clearance)} | ${f(b.streetClearance)} | ${b.outside} | ${b.queueMax} |

Fine minus coarse clearance is **${f(delta)} s**${delta !== null ? ` (${((100 * delta) / a.clearance!).toFixed(2)}%)` : ""}. This is one refinement pair, not an order-of-convergence proof. Both runs execute invariant checks at every step. Saturated isolated gate tests at both intervals deliver exactly 117 people in 100 s at the specified 1.17 people/s. Full-network route changes and lane-request tie ordering are discontinuous, so matching conservation and throughput does not prove a timestep-independent clearance estimate. The reference step is retained regardless of which result is faster.

| Exit group | Reference count | Fine-step count |
| --- | --- | --- |
${exits}

Full logs, sparse per-link occupancy/queue histories and queue-wait totals for the pair are in [refinement.json.gz](../results/refinement.json.gz).

## Accessibility and endpoint validation

The audience includes all three wheelchair users. Each origin has a verified route to an exterior landing without stairs; the middle stepped connectors and both balcony stair systems are excluded. They are included in building clearance, and no assistance delay is silently removed from the street endpoint.

Reference seed 101:

| Person | Exterior crossing · s | Street arrival · s |
| --- | --- | --- |
${accessible}

Two teams become available at 60 s and serve queued exterior arrivals sequentially. Street arrival must be later than exterior crossing. Ordinary external stair travel is an explicit free-walk estimate; external landing crowd storage and stair queues are outside this implementation.

## Censored runs and numerical limitations

${censored.length ? censored.join("\n") : "No tested replication was censored."}

These runs remain unresolved with T > 900 s and count as failures against 180 s. Persistent queue-network gridlock is a model outcome, not evidence that the same people would remain trapped in the physical hall. In particular, the strict return-wait sensitivity exposes dependence on how reversals and finite lane storage are represented. A human crowd can use small-scale lateral motions that this queue network does not resolve. No occupant was deleted, no storage ceiling relaxed and no link capacity increased to force completion.

## Geometry confidence and remaining validation

The graph contains ${Object.keys(g.nodes).length} nodes, ${Object.keys(g.links).length} physical links and ${g.rows.length} represented row blocks. Plan-derived topology retains nine regular auditorium doors, six orchestra ascents, four portico doors, three foyer entrances, five foyer exterior doors and seven exit groups. Both stepped cross-aisles occupy an actual gap in the reconstructed row layout; they do not reuse a seating row. The same graph drives physics and the map.

Usable widths, the scale, elevations, individual row allocations, wheelchair placements, column positions, wall details and barrier/post positions remain inferred. The exact printed chair inventory is not transcribed, and this is not a surveyed or fully digitized CAD model. Those uncertainties cannot be validated with an automated conservation test. No measured Bailey evacuation, audience demographics or compliance data were available for calibration or external validation. Smoke, contacts, injuries, detailed seating interactions, external landing congestion and assistance-team travel between landings are excluded.

The detailed computational conventions and measurement priorities are in [implementation-decisions.md](implementation-decisions.md). These results test the supplied model under explicit assumptions; they do not certify the building or establish a safe operating plan.
`,
);
console.log("Wrote docs/validation.md from retained results.");
