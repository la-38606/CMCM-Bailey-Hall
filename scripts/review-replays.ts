import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { Simulation, ENGINE_VERSION } from "../src/engine/simulation";
import { reference } from "../src/engine/config";
import { interventionCandidates } from "../src/engine/interventions";
import { reviewLayout } from "../src/review/layout";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const checks = [];
for (const policy of [
  "baseline",
  "coordinated",
  "partial-barriers",
  "dynamic-only",
  "dynamic-partial",
]) {
  const original = JSON.parse(
    gunzipSync(
      await readFile(
        `results/intervention-confirmation/runs/${policy}-5001.json.gz`,
      ),
    ).toString(),
  );
  const sim = new Simulation(original.config, original.seed),
    rerun = sim.run();
  sim.assertInvariants();
  assert.equal(original.engineVersion, "1.3.0");
  const normalized = { ...rerun, engineVersion: original.engineVersion };
  assert.equal(
    hash(JSON.stringify(normalized)),
    hash(JSON.stringify(original)),
  );
  checks.push({
    policy,
    seed: original.seed,
    clearance: rerun.clearance,
    eventCount: rerun.events.length,
    allResultsMatchExceptVersion: true,
    originalHash: hash(JSON.stringify(original)),
    rerunHash: hash(JSON.stringify(rerun)),
  });
  console.log(policy, rerun.clearance, "full result matches except version");
}
const c = interventionCandidates(reference())["dynamic-partial"],
  sim = new Simulation(c, 5001);
await writeFile(
  "results/review/replays.json",
  JSON.stringify(
    {
      engineVersion: ENGINE_VERSION,
      historicalEngineVersion: "1.3.0",
      scope:
        "Validation-only patch; five full first-seed replays, not a new 500-run Monte Carlo experiment.",
      checks,
      layoutFindings: reviewLayout(sim.geometry, c),
    },
    null,
    2,
  ) + "\n",
);
