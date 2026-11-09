import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { readFile, writeFile, mkdir, readdir, access } from "node:fs/promises";
import { resolve, join } from "node:path";
import { performance } from "node:perf_hooks";
import { Simulation, ENGINE_VERSION } from "../src/engine/simulation";
import { quantile, summarize } from "../src/engine/metrics";
import { EXITS, type Config, type RunResult } from "../src/engine/types";
import { args, integer } from "./io";

const sha = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const out = resolve(args.out ?? "results/monte-carlo-100");
const first = integer("seed", 1001),
  count = integer("runs", 100),
  jobs = integer("jobs", 4);
if (
  count < 1 ||
  jobs < 1 ||
  jobs > 32 ||
  !Number.isSafeInteger(first + count - 1)
)
  throw new Error("Invalid seed range, runs or jobs");
const mean = (x: number[]) =>
  x.length ? x.reduce((a, b) => a + b, 0) / x.length : null;
const sd = (x: number[]) =>
  x.length > 1
    ? Math.sqrt(x.reduce((a, b) => a + (b - mean(x)!) ** 2, 0) / (x.length - 1))
    : null;
const stats = (x: number[]) => ({
  n: x.length,
  mean: mean(x),
  sd: sd(x),
  min: x.length ? Math.min(...x) : null,
  p05: quantile(x, 0.05),
  p25: quantile(x, 0.25),
  median: quantile(x, 0.5),
  p75: quantile(x, 0.75),
  p90: quantile(x, 0.9),
  p95: quantile(x, 0.95),
  max: x.length ? Math.max(...x) : null,
});
async function sourceFingerprint() {
  const names = (await readdir("src/engine"))
    .filter((n) => n.endsWith(".ts"))
    .sort();
  return sha(
    JSON.stringify(
      await Promise.all(
        names.map(async (n) => [n, sha(await readFile(`src/engine/${n}`))]),
      ),
    ),
  );
}

type Compact = {
  seed: number;
  status: RunResult["status"];
  clearance: number | null;
  streetClearance: number | null;
  outside: number;
  street: number;
  success180: boolean;
  queueMax: number;
  exitUsage: RunResult["exitUsage"];
  accessible: RunResult["accessible"];
  waiting: ReturnType<typeof stats>;
  eventCount: number;
  eventHash: string;
  configHash: string;
  audienceHash: string;
  olderCount: number;
  familiarityCount: number;
  timeOrientedCount: number;
  groupedCount: number;
  meanSpeed: number;
  meanRecognition: number;
  meanResponse: number;
  managerActivations: number[];
  wallSeconds: number;
  topQueues: {
    link: string;
    peakQueue: number;
    peakDensity: number;
    denseSeconds: number;
  }[];
  archive: string;
  archiveHash: string;
};

if (args.worker !== undefined) {
  const worker = integer("worker", 0),
    c: Config = JSON.parse(await readFile(join(out, "config.json"), "utf8")),
    configHash = sha(JSON.stringify(c));
  for (let i = worker; i < count; i += jobs) {
    const seed = first + i,
      start = performance.now(),
      sim = new Simulation(c, seed);
    const traits = sim.people.map((p) => ({
      id: p.id,
      row: p.row,
      seat: p.seat,
      wheelchair: p.wheelchair,
      older: p.older,
      speed: p.speed,
      radius: p.radius,
      recognition: p.recognition,
      response: p.response,
      group: p.group,
      familiarity: p.familiarity,
      taste: p.taste,
      compliance: p.compliance,
      known: p.known,
    }));
    const audienceHash = sha(JSON.stringify(traits));
    const managerActivations = sim.guidance.managers.map((m) => m.activation);
    const r = sim.run();
    sim.assertInvariants();
    if (
      sha(JSON.stringify(r.config)) !== configHash ||
      sim.people.length !== 1329 ||
      sim.people.filter((p) => p.wheelchair).length !== 3
    )
      throw new Error(
        `Replication ${seed} changed configuration or population`,
      );
    const archive = `seed-${seed}.json.gz`,
      bytes = gzipSync(
        JSON.stringify({ audienceHash, configHash, result: r }),
        { level: 6 },
      );
    await writeFile(join(out, "replications", archive), bytes);
    const record: Compact = {
      seed,
      status: r.status,
      clearance: r.clearance,
      streetClearance: r.streetClearance,
      outside: r.outside,
      street: r.street,
      success180: r.success180,
      queueMax: r.queueMax,
      exitUsage: r.exitUsage,
      accessible: r.accessible,
      waiting: stats(r.waitingTimes),
      eventCount: r.events.length,
      eventHash: sha(JSON.stringify(r.events)),
      configHash,
      audienceHash,
      olderCount: traits.filter((p) => p.older).length,
      familiarityCount: traits.filter((p) => p.familiarity > 0).length,
      timeOrientedCount: traits.filter((p) => p.familiarity === 0).length,
      groupedCount: traits.filter((p) => p.group.length).length,
      meanSpeed: mean(traits.map((p) => p.speed))!,
      meanRecognition: mean(traits.map((p) => p.recognition))!,
      meanResponse: mean(traits.map((p) => p.response))!,
      managerActivations,
      wallSeconds: (performance.now() - start) / 1000,
      topQueues: Object.entries(r.links)
        .sort((a, b) => b[1].peakQueue - a[1].peakQueue)
        .slice(0, 8)
        .map(([link, l]) => ({
          link,
          peakQueue: l.peakQueue,
          peakDensity: l.peakDensity,
          denseSeconds: l.denseSeconds,
        })),
      archive,
      archiveHash: sha(bytes),
    };
    await writeFile(
      join(out, "replications", `seed-${seed}.summary.json`),
      JSON.stringify(record, null, 2) + "\n",
    );
    process.stdout.write(
      JSON.stringify({
        seed,
        status: r.status,
        clearance: r.clearance,
        outside: r.outside,
        wallSeconds: record.wallSeconds,
      }) + "\n",
    );
  }
} else {
  const started = new Date().toISOString(),
    start = performance.now(),
    fingerprint = await sourceFingerprint();
  await mkdir(join(out, "replications"), { recursive: true });
  try {
    await access(join(out, "config.json"));
    throw new Error(
      "Output already contains a run; use a new --out directory to preserve the evidence.",
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const c: Config = JSON.parse(
    await readFile(args.config ?? "scenarios/emergency.json", "utf8"),
  );
  await writeFile(join(out, "config.json"), JSON.stringify(c, null, 2) + "\n");
  await writeFile(
    join(out, "protocol.json"),
    JSON.stringify(
      {
        engineVersion: ENGINE_VERSION,
        engineSourceFingerprint: fingerprint,
        started,
        firstSeed: first,
        runs: count,
        jobs,
        configHash: sha(JSON.stringify(c)),
        population: 1329,
        stochasticResampling:
          "New seed per replication; fresh fixed traits, preference types, groups, tastes, compliance, notice, hearing, staff activation and assistance. Within-replication persistent tendencies remain persistent.",
        fixed:
          "Geometry, seat inventory, wheelchair origins/count, distributions, scenario interventions, dt and cutoff",
      },
      null,
      2,
    ) + "\n",
  );
  let completed = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(jobs, count) },
      (_, worker) =>
        new Promise<void>((yes, no) => {
          const child = spawn(
            process.execPath,
            [
              "--import",
              "tsx",
              "scripts/monte-carlo.ts",
              "--worker",
              String(worker),
              "--seed",
              String(first),
              "--runs",
              String(count),
              "--jobs",
              String(jobs),
              "--out",
              out,
            ],
            { stdio: ["ignore", "pipe", "inherit"] },
          );
          let pending = "";
          child.stdout.on("data", (chunk) => {
            pending += chunk;
            const lines = pending.split("\n");
            pending = lines.pop()!;
            for (const line of lines) {
              if (!line) continue;
              const r = JSON.parse(line);
              completed++;
              console.log(
                `${completed}/${count} seed=${r.seed} clearance=${r.clearance ?? "> " + c.cutoff} outside=${r.outside}/1329 (${r.wallSeconds.toFixed(1)} wall s)`,
              );
            }
          });
          child.on("error", no);
          child.on("close", (code) =>
            code === 0
              ? yes()
              : no(new Error(`Worker ${worker} exited ${code}`)),
          );
        }),
    ),
  );
  if (fingerprint !== (await sourceFingerprint()))
    throw new Error("Engine source changed during the experiment");
  const runs: Compact[] = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      readFile(
        join(out, "replications", `seed-${first + i}.summary.json`),
        "utf8",
      ).then(JSON.parse),
    ),
  );
  if (
    completed !== count ||
    new Set(runs.map((r) => r.seed)).size !== count ||
    new Set(runs.map((r) => r.audienceHash)).size !== count ||
    runs.some((r) => r.configHash !== sha(JSON.stringify(c)))
  )
    throw new Error(
      "Replication count, resampling or configuration audit failed",
    );
  // summarize reads only seed, clearance, success180 and queueMax, retained above.
  const basic = summarize(runs as unknown as RunResult[]),
    times = runs
      .flatMap((r) => (r.clearance === null ? [] : [r.clearance]))
      .sort((a, b) => a - b);
  const empiricalQuantile = (q: number) =>
    times[Math.ceil(q * count) - 1] ?? null;
  const boundedTimes = runs.map((r) => r.clearance ?? c.cutoff);
  const summary = {
    ...basic,
    engineVersion: ENGINE_VERSION,
    engineSourceFingerprint: fingerprint,
    configHash: sha(JSON.stringify(c)),
    started,
    finished: new Date().toISOString(),
    wallSeconds: (performance.now() - start) / 1000,
    scenario: c,
    completedOnly: stats(times),
    allRunEmpiricalQuantiles: {
      p05: empiricalQuantile(0.05),
      p25: empiricalQuantile(0.25),
      median: empiricalQuantile(0.5),
      p75: empiricalQuantile(0.75),
      p90: empiricalQuantile(0.9),
      p95: empiricalQuantile(0.95),
      p99: empiricalQuantile(0.99),
    },
    restrictedMeanAtCutoff: mean(boundedTimes),
    unconditionalMeanLowerBound:
      times.length === count ? null : mean(boundedTimes),
    queueMaxDistribution: stats(runs.map((r) => r.queueMax)),
    meanPersonQueueWait: stats(runs.map((r) => r.waiting.mean!)),
    streetCompletedOnly: stats(
      runs.flatMap((r) =>
        r.streetClearance === null ? [] : [r.streetClearance],
      ),
    ),
    exitUsage: Object.fromEntries(
      EXITS.map((exit) => [
        exit,
        {
          ...stats(runs.map((r) => r.exitUsage[exit])),
          total: runs.reduce((n, r) => n + r.exitUsage[exit], 0),
          fractionOfAllOccupants:
            runs.reduce((n, r) => n + r.exitUsage[exit], 0) / (1329 * count),
        },
      ]),
    ),
    accessible: {
      total: 3 * count,
      outside: runs.reduce(
        (n, r) => n + r.accessible.filter((p) => p.exitTime !== null).length,
        0,
      ),
      street: runs.reduce(
        (n, r) => n + r.accessible.filter((p) => p.streetTime !== null).length,
        0,
      ),
      exteriorTimes: stats(
        runs.flatMap((r) =>
          r.accessible.flatMap((p) =>
            p.exitTime === null ? [] : [p.exitTime],
          ),
        ),
      ),
      streetTimes: stats(
        runs.flatMap((r) =>
          r.accessible.flatMap((p) =>
            p.streetTime === null ? [] : [p.streetTime],
          ),
        ),
      ),
    },
    audienceAudit: {
      uniqueAudienceHashes: new Set(runs.map((r) => r.audienceHash)).size,
      olderCount: stats(runs.map((r) => r.olderCount)),
      familiarityCount: stats(runs.map((r) => r.familiarityCount)),
      timeOrientedCount: stats(runs.map((r) => r.timeOrientedCount)),
      groupedCount: stats(runs.map((r) => r.groupedCount)),
      meanSpeed: stats(runs.map((r) => r.meanSpeed)),
      meanRecognition: stats(runs.map((r) => r.meanRecognition)),
      meanResponse: stats(runs.map((r) => r.meanResponse)),
    },
    unresolvedRuns: runs
      .filter((r) => r.clearance === null)
      .map((r) => ({
        seed: r.seed,
        outside: r.outside,
        inside: 1329 - r.outside,
      })),
  };
  await writeFile(
    join(out, "summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );
  await writeFile(
    join(out, "replications.json"),
    JSON.stringify(runs, null, 2) + "\n",
  );
  const fields = [
    "seed",
    "status",
    "clearance",
    "outside",
    "streetClearance",
    "success180",
    "queueMax",
    "olderCount",
    "familiarityCount",
    "groupedCount",
    "audienceHash",
  ] as const;
  await writeFile(
    join(out, "replications.csv"),
    fields.join(",") +
      "\n" +
      runs.map((r) => fields.map((k) => r[k] ?? "").join(",")).join("\n") +
      "\n",
  );
  console.log(
    JSON.stringify(
      {
        runs: count,
        completed: basic.resolved,
        unresolved: basic.unresolved,
        success180: basic.success180,
        completedOnly: summary.completedOnly,
        allRunEmpiricalQuantiles: summary.allRunEmpiricalQuantiles,
        wallSeconds: summary.wallSeconds,
      },
      null,
      2,
    ),
  );
}
