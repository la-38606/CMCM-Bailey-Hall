import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { Simulation } from "../src/engine/simulation";
import { quantile } from "../src/engine/metrics";
import { EXITS, type RunResult } from "../src/engine/types";
import { args } from "./io";

const out = resolve(args.out ?? "results/monte-carlo-100");
const sha = (v: string | Buffer) =>
  createHash("sha256").update(v).digest("hex");
const records = JSON.parse(
  await readFile(join(out, "replications.json"), "utf8"),
) as {
  seed: number;
  archive: string;
  archiveHash: string;
  eventHash: string;
  eventCount: number;
  configHash: string;
  audienceHash: string;
  outside: number;
  clearance: number | null;
}[];
const summary = JSON.parse(await readFile(join(out, "summary.json"), "utf8"));
assert.equal(records.length, summary.runs);
const at180: { seed: number; outside: number; fraction: number }[] = [];
let events = 0;
let replayHash = "";
for (const [index, record] of records.entries()) {
  const bytes = await readFile(join(out, "replications", record.archive));
  assert.equal(sha(bytes), record.archiveHash);
  const archive = JSON.parse(gunzipSync(bytes).toString());
  const r: RunResult = archive.result;
  assert.equal(r.seed, record.seed);
  assert.equal(sha(JSON.stringify(r.config)), summary.configHash);
  assert.equal(archive.configHash, record.configHash);
  assert.equal(archive.audienceHash, record.audienceHash);
  assert.equal(sha(JSON.stringify(r.events)), record.eventHash);
  assert.equal(r.events.length, record.eventCount);
  assert.equal(r.clearance, record.clearance);
  assert.equal(r.outside, record.outside);
  const crossings = r.events.filter((e) => e.type === "exterior-crossing");
  assert.equal(crossings.length, r.outside);
  assert.equal(new Set(crossings.map((e) => e.person)).size, r.outside);
  assert.equal(r.waitingTimes.length, 1329);
  assert.equal(r.accessible.length, 3);
  for (const exit of EXITS)
    assert.equal(
      crossings.filter((e) => e.detail === exit).length,
      r.exitUsage[exit],
    );
  assert.equal(
    r.events.filter((e) => e.type === "street-arrival").length,
    r.street,
  );
  assert.equal(
    r.clearance,
    r.outside === 1329 ? Math.max(...crossings.map((e) => e.time)) : null,
  );
  const n = crossings.filter((e) => e.time <= 180).length;
  assert.equal(r.success180, n === 1329);
  at180.push({ seed: r.seed, outside: n, fraction: n / 1329 });
  events += r.events.length;
  if (index === 0) {
    const replay = new Simulation(r.config, r.seed).run();
    replayHash = sha(JSON.stringify(replay));
    assert.equal(
      replayHash,
      sha(JSON.stringify(r)),
      "Full deterministic replay differs",
    );
  }
}
const counts = at180.map((r) => r.outside);
const audit = {
  replicationsVerified: records.length,
  archivesAndEventHashesVerified: true,
  uniqueAudiences: new Set(records.map((r) => r.audienceHash)).size,
  identicalScenario: new Set(records.map((r) => r.configHash)).size === 1,
  exteriorAndStreetCountsRecomputedFromEvents: true,
  eventsVerified: events,
  deterministicReplay: {
    seed: records[0].seed,
    fullResultHash: replayHash,
    matched: true,
  },
  at180: {
    meanOutside: counts.reduce((a, b) => a + b, 0) / counts.length,
    meanFractionOutside:
      counts.reduce((a, b) => a + b, 0) / (1329 * counts.length),
    minOutside: Math.min(...counts),
    medianOutside: quantile(counts, 0.5),
    maxOutside: Math.max(...counts),
    replications: at180,
  },
};
await writeFile(join(out, "audit.json"), JSON.stringify(audit, null, 2) + "\n");
console.log(
  JSON.stringify(
    { ...audit, at180: { ...audit.at180, replications: undefined } },
    null,
    2,
  ),
);
