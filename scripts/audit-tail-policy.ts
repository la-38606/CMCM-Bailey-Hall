import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { Simulation, ENGINE_VERSION } from "../src/engine/simulation";
import type { RunResult } from "../src/engine/types";
const root = "results/tail-policy";
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const load = async (path: string) =>
  JSON.parse(gunzipSync(await readFile(path)).toString());
const replications = [],
  historicalReplays = [];
let commitments = 0,
  changedDestinations = 0;
for (let seed = 5001; seed <= 5010; seed++) {
  const a = await load(
    `${root}/with-fallback/replications/seed-${seed}.json.gz`,
  );
  const b = await load(
    `${root}/without-fallback/replications/seed-${seed}.json.gz`,
  );
  assert.equal(a.audienceHash, b.audienceHash);
  const r: RunResult = a.result,
    control: RunResult = b.result;
  const { tailFallback, name: _name, ...fixed } = r.config;
  const { name: _controlName, ...controlFixed } = control.config;
  assert.deepEqual(fixed, controlFixed);
  assert.deepEqual(tailFallback, { remaining: 40, stalledSeconds: 10 });
  const finals = r.events.filter((e) => e.type === "tail-final-commitment");
  assert.equal(new Set(finals.map((e) => e.person)).size, finals.length);
  for (const event of finals) {
    const choice = JSON.parse(event.detail);
    assert.ok(choice.remaining <= 40 && choice.stalledFor > 10);
    assert.ok(
      choice.alternatives.every(
        (r: { seconds: number }) => r.seconds >= choice.estimatedSeconds - 1e-9,
      ),
    );
    const after = r.events.filter(
      (e) => e.person === event.person && e.time > event.time,
    );
    assert.ok(
      !after.some((e) =>
        [
          "route-choice",
          "route-review",
          "accepted-manager",
          "accepted-sign",
          "noticed-sign",
          "learned-closure",
        ].includes(e.type),
      ),
    );
    assert.deepEqual(
      after
        .filter((e) => e.type === "link-entry")
        .map((e) => e.detail.split(";")[0]),
      choice.route,
    );
    assert.equal(
      after.find((e) => e.type === "exterior-crossing")?.detail,
      choice.exit,
    );
    const previous = r.events
      .filter(
        (e) =>
          e.person === event.person &&
          e.type === "route-choice" &&
          e.time <= event.time,
      )
      .at(-1);
    if (previous && !previous.detail.includes(`→ ${choice.exit} at`))
      changedDestinations++;
  }
  commitments += finals.length;
  replications.push({
    seed,
    withFallback: r.clearance,
    withoutFallback: control.clearance,
    commitments: finals.length,
    audienceHash: a.audienceHash,
  });
}
for (const policy of [
  "baseline",
  "coordinated",
  "partial-barriers",
  "dynamic-only",
  "dynamic-partial",
]) {
  const original: RunResult = await load(
    `results/intervention-confirmation/runs/${policy}-5001.json.gz`,
  );
  const sim = new Simulation(original.config, original.seed),
    rerun = sim.run();
  sim.assertInvariants();
  assert.equal(
    hash({ ...rerun, engineVersion: original.engineVersion }),
    hash(original),
  );
  historicalReplays.push({
    policy,
    seed: original.seed,
    clearance: rerun.clearance,
    matchedExceptVersion: true,
  });
}
await writeFile(
  `${root}/policy-audit.json`,
  JSON.stringify(
    {
      engineVersion: ENGINE_VERSION,
      scope:
        "Ten paired regression audiences; not a new 100-replication study.",
      pairedAudiencesVerified: replications.length,
      commitments,
      changedDestinations,
      lockedRoutesAndNoLaterUpdatesVerified: true,
      historicalReplays,
      replications,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    pairedAudiences: replications.length,
    commitments,
    changedDestinations,
    historicalReplays: historicalReplays.length,
  }),
);
