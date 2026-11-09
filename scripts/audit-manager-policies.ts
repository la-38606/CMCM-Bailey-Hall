import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { buildGeometry } from "../src/engine/geometry";
import type { Config, RunResult } from "../src/engine/types";
const root = "results/manager-policy-study";
const design = JSON.parse(await readFile(`${root}/design.json`, "utf8"));
const policyAudits = [];
for (const policy of design.policies as string[]) {
  const audit = JSON.parse(
    await readFile(`${root}/${policy}/audit.json`, "utf8"),
  );
  assert.equal(audit.replicationsVerified, design.replicationsPerPolicy);
  assert.equal(audit.deterministicReplay.matched, true);
  const c: Config = JSON.parse(
    await readFile(`${root}/${policy}/config.json`, "utf8"),
  );
  const g = buildGeometry(c);
  const rows = JSON.parse(
    await readFile(`${root}/${policy}/replications.json`, "utf8"),
  );
  let commitments = 0,
    changedExits = 0,
    wheelchairOutside = 0,
    wheelchairStreet = 0;
  for (const row of rows) {
    const { result: r }: { result: RunResult } = JSON.parse(
      gunzipSync(
        await readFile(`${root}/${policy}/replications/${row.archive}`),
      ).toString(),
    );
    let inside = 1329;
    const destinations = new Map<number, string>();
    const locks = new Map<
      number,
      { route: string[]; index: number; exit: string }
    >();
    const wheelchairs = new Set(r.accessible.map((p) => p.id));
    for (const e of r.events) {
      if (e.type === "exterior-crossing") inside--;
      if (e.type === "route-choice" && e.person !== undefined)
        destinations.set(e.person, e.detail.split(" → ")[1].split(" at ")[0]);
      if (e.type === "tail-final-commitment") {
        assert.notEqual(e.person, undefined);
        assert.ok(!locks.has(e.person!));
        const v = JSON.parse(e.detail);
        assert.equal(v.remaining, inside);
        assert.ok(inside <= 40 && v.stalledFor > 10);
        assert.ok(
          v.alternatives.every(
            (a: { seconds: number }) => a.seconds >= v.estimatedSeconds - 1e-9,
          ),
        );
        let node = v.node;
        for (const id of v.route) {
          const link = g.links[id];
          assert.ok(link && link.length > 0 && !link.closed);
          const edge = g.adjacency[node].find((a) => a.link === id);
          assert.ok(edge);
          if (wheelchairs.has(e.person!)) assert.ok(link.accessible);
          node = edge.to;
        }
        assert.equal(g.nodes[node].exit, v.exit);
        locks.set(e.person!, { route: v.route, index: 0, exit: v.exit });
        if (
          destinations.has(e.person!) &&
          destinations.get(e.person!) !== v.exit
        )
          changedExits++;
        commitments++;
      } else if (e.person !== undefined && locks.has(e.person)) {
        const lock = locks.get(e.person)!;
        assert.ok(
          ![
            "route-choice",
            "route-review",
            "accepted-manager",
            "accepted-sign",
            "noticed-sign",
            "learned-closure",
          ].includes(e.type),
        );
        if (e.type === "link-entry")
          assert.equal(e.detail.split(";")[0], lock.route[lock.index++]);
        if (e.type === "exterior-crossing") {
          assert.equal(e.detail, lock.exit);
          assert.equal(lock.index, lock.route.length);
        }
      }
    }
    assert.equal(inside, 1329 - r.outside);
    wheelchairOutside += r.accessible.filter((p) => p.exitTime !== null).length;
    wheelchairStreet += r.accessible.filter(
      (p) => p.streetTime !== null && p.streetTime <= c.cutoff,
    ).length;
  }
  policyAudits.push({
    policy,
    runs: rows.length,
    commitments,
    changedExits,
    wheelchairOutside,
    wheelchairStreet,
    exteriorCountsVerified: true,
    lockedPathsAndNoLaterUpdatesVerified: true,
  });
}
await writeFile(
  `${root}/policy-audit.json`,
  JSON.stringify(
    { engineVersion: design.engineVersion, policyAudits },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify(policyAudits));
