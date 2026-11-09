import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { resolve, join } from "node:path";
import { Simulation, ENGINE_VERSION } from "../src/engine/simulation";
import type { RunResult } from "../src/engine/types";
import { args } from "./io";
const out = resolve(args.out ?? "results/intervention-confirmation");
const hash = (v: string | Buffer) =>
  createHash("sha256").update(v).digest("hex");
const summary = JSON.parse(await readFile(join(out, "summary.json"), "utf8"));
const protocol = JSON.parse(await readFile(join(out, "protocol.json"), "utf8"));
const sourceHash = hash(
  JSON.stringify(
    await Promise.all(
      (await readdir("src/engine"))
        .filter((n) => n.endsWith(".ts"))
        .sort()
        .map(async (n) => [n, hash(await readFile(`src/engine/${n}`))]),
    ),
  ),
);
assert.equal(sourceHash, protocol.sourceHash);
assert.equal(summary.sourceHash, protocol.sourceHash);
let checked = 0,
  eventCount = 0;
const replay = [];
for (const name of protocol.names) {
  const records = summary.all[name];
  assert.equal(records.length, protocol.count);
  const config = JSON.parse(
    await readFile(join(out, "configs", name + ".json"), "utf8"),
  );
  for (const [i, record] of records.entries()) {
    assert.equal(record.seed, protocol.first + i);
    const bytes = await readFile(
      join(out, "runs", `${name}-${record.seed}.json.gz`),
    );
    assert.equal(hash(bytes), record.archiveHash);
    const r: RunResult = JSON.parse(gunzipSync(bytes).toString());
    assert.equal(r.engineVersion, ENGINE_VERSION);
    assert.equal(hash(JSON.stringify(r.config)), hash(JSON.stringify(config)));
    assert.equal(hash(JSON.stringify(r.events)), record.eventHash);
    assert.equal(r.events.length, record.eventCount);
    const exits = r.events.filter((e) => e.type === "exterior-crossing"),
      street = r.events.filter((e) => e.type === "street-arrival");
    assert.equal(new Set(exits.map((e) => e.person)).size, exits.length);
    assert.equal(exits.length, r.outside);
    assert.equal(street.length, r.street);
    assert.equal(
      r.clearance,
      exits.length === 1329 ? Math.max(...exits.map((e) => e.time)) : null,
    );
    assert.equal(r.clearance, record.clearance);
    assert.equal(r.accessible.length, 3);
    assert.equal(r.waitingTimes.length, 1329);
    assert.equal(exits.filter((e) => e.time <= 180).length, record.outside180);
    for (const [exit, n] of Object.entries(r.exitUsage))
      assert.equal(exits.filter((e) => e.detail === exit).length, n);
    if (i === 0) {
      const sim = new Simulation(config, r.seed);
      const audienceHash = hash(
        JSON.stringify(
          sim.people.map((p) => [
            p.id,
            p.older,
            p.speed,
            p.radius,
            p.recognition,
            p.response,
            p.group,
            p.familiarity,
            p.taste,
            p.compliance,
          ]),
        ),
      );
      assert.equal(audienceHash, record.audienceHash);
      const rerun = sim.run();
      sim.assertInvariants();
      assert.equal(hash(JSON.stringify(rerun)), hash(JSON.stringify(r)));
      replay.push({
        policy: name,
        seed: r.seed,
        matched: true,
        fullResultHash: hash(JSON.stringify(r)),
      });
    }
    checked++;
    eventCount += r.events.length;
  }
  assert.equal(
    new Set(records.map((r: any) => r.audienceHash)).size,
    protocol.count,
  );
}
for (let i = 0; i < protocol.count; i++)
  assert.equal(
    new Set(protocol.names.map((n: string) => summary.all[n][i].audienceHash))
      .size,
    1,
  );
const audit = {
  checked,
  sourceHashVerified: true,
  sourceHash,
  eventCount,
  uniqueAudiences: protocol.count,
  pairedAudiencesIdentical: true,
  configurationHashesAndArchiveHashesVerified: true,
  countsReconstructedFromEvents: true,
  fullResultReplays: replay,
};
await writeFile(join(out, "audit.json"), JSON.stringify(audit, null, 2) + "\n");
console.log(JSON.stringify(audit, null, 2));
