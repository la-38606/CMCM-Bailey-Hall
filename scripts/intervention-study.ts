import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { join, resolve } from "node:path";
import { Simulation, ENGINE_VERSION } from "../src/engine/simulation";
import { quantile, summarize } from "../src/engine/metrics";
import type { Config, RunResult } from "../src/engine/types";
import { args, integer } from "./io";
const out = resolve(args.out ?? "results/intervention-pilot"),
  count = integer("runs", 3),
  first = integer("seed", 3001),
  jobs = integer("jobs", 4);
const hash = (v: string | Buffer) =>
  createHash("sha256").update(v).digest("hex");
const json = async (p: string, v: unknown) =>
  writeFile(p, JSON.stringify(v, null, 2) + "\n");
const fingerprint = async () =>
  hash(
    JSON.stringify(
      await Promise.all(
        (await readdir("src/engine"))
          .filter((n) => n.endsWith(".ts"))
          .sort()
          .map(async (n) => [n, hash(await readFile(`src/engine/${n}`))]),
      ),
    ),
  );
if (count < 1 || jobs < 1 || jobs > 16) throw Error("Invalid count/jobs");
type Job = { name: string; seed: number };
if (args.worker !== undefined) {
  const protocol = JSON.parse(
    await readFile(join(out, "protocol.json"), "utf8"),
  );
  for (
    let i = integer("worker", 0);
    i < protocol.tasks.length;
    i += protocol.jobs
  ) {
    const { name, seed }: Job = protocol.tasks[i],
      c: Config = JSON.parse(
        await readFile(join(out, "configs", name + ".json"), "utf8"),
      );
    const start = performance.now(),
      sim = new Simulation(c, seed);
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
    const r = sim.run();
    sim.assertInvariants();
    const archive = gzipSync(JSON.stringify(r), { level: 1 });
    const record = {
      seed,
      status: r.status,
      clearance: r.clearance,
      streetClearance: r.streetClearance,
      success180: r.success180,
      outside: r.outside,
      street: r.street,
      queueMax: r.queueMax,
      exitUsage: r.exitUsage,
      accessible: r.accessible,
      meanWait: r.waitingTimes.reduce((a, b) => a + b, 0) / 1329,
      outside180: r.events.filter(
        (e) => e.type === "exterior-crossing" && e.time <= 180,
      ).length,
      peakDensity: Math.max(
        ...Object.values(r.links).map((l) => l.peakDensity),
      ),
      densePersonSeconds: r.linkHistory
        ? Object.entries(r.linkHistory).reduce((total, [id, h]) => {
            const e = sim.geometry.links[id];
            return (
              total +
              h.reduce(
                (n, v, j) =>
                  n +
                  (v[1] / (e.plan * e.width) > 2
                    ? v[1] * ((h[j + 1]?.[0] ?? sim.time) - v[0])
                    : 0),
                0,
              )
            );
          }, 0)
        : 0,
      audienceHash,
      configHash: hash(JSON.stringify(c)),
      eventHash: hash(JSON.stringify(r.events)),
      archiveHash: hash(archive),
      eventCount: r.events.length,
      wallSeconds: (performance.now() - start) / 1000,
    };
    if (sim.people.length !== 1329 || r.accessible.length !== 3)
      throw Error("Population changed");
    await writeFile(join(out, "runs", `${name}-${seed}.json.gz`), archive);
    await json(join(out, "runs", `${name}-${seed}.summary.json`), record);
    console.log(
      JSON.stringify({
        name,
        seed,
        clearance: r.clearance,
        outside: r.outside,
        wall: record.wallSeconds,
      }),
    );
  }
} else {
  await mkdir(out, { recursive: false });
  await mkdir(join(out, "configs"));
  await mkdir(join(out, "runs"));
  const names: string[] = (
    args.configs ??
    "baseline,coordinated,barriers-only,partial-barriers,led-only,combined,combined-partial,dynamic-combined,eight-managers,eight-combined,ten-combined"
  ).split(",");
  const tasks: Job[] = names.flatMap((name) =>
    Array.from({ length: count }, (_, i) => ({ name, seed: first + i })),
  );
  const sourceHash = await fingerprint(),
    started = Date.now();
  execFileSync("tar", [
    "-czf",
    join(out, "engine-source.tar.gz"),
    "src/engine",
  ]);
  for (const name of names)
    await writeFile(
      join(out, "configs", name + ".json"),
      await readFile(`scenarios/study/${name}.json`),
    );
  await json(join(out, "protocol.json"), {
    engineVersion: ENGINE_VERSION,
    sourceHash,
    started: new Date(started).toISOString(),
    count,
    first,
    jobs,
    names,
    tasks,
    design:
      "Fixed configuration per policy; matched audience seeds across policies; fresh named random streams per replication. Unresolved runs retained at 900 s.",
    selection:
      args.selection ?? "Exploratory development; not confirmatory evidence",
  });
  let finished = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(jobs, tasks.length) },
      (_, worker) =>
        new Promise<void>((yes, no) => {
          const child = spawn(
            process.execPath,
            [
              "--import",
              "tsx",
              "scripts/intervention-study.ts",
              "--worker",
              String(worker),
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
              finished++;
              console.log(
                `${finished}/${tasks.length} ${r.name} seed ${r.seed}: ${r.clearance ?? ">900"} s; outside ${r.outside}; wall ${r.wall.toFixed(1)} s`,
              );
            }
          });
          child.on("error", no);
          child.on("close", (code) =>
            code === 0 ? yes() : no(Error(`Worker exited ${code}`)),
          );
        }),
    ),
  );
  if (sourceHash !== (await fingerprint()))
    throw Error("Engine changed during study");
  const all: Record<string, any[]> = {};
  for (const name of names) {
    all[name] = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        readFile(
          join(out, "runs", `${name}-${first + i}.summary.json`),
          "utf8",
        ).then(JSON.parse),
      ),
    );
  }
  for (const name of names) {
    const configHash = hash(
      JSON.stringify(
        JSON.parse(
          await readFile(join(out, "configs", name + ".json"), "utf8"),
        ),
      ),
    );
    if (
      all[name].some(
        (r, i) => r.seed !== first + i || r.configHash !== configHash,
      ) ||
      new Set(all[name].map((r) => r.audienceHash)).size !== count
    )
      throw Error("Seed, config or resampling audit failed");
  }
  for (let i = 0; i < count; i++)
    if (new Set(names.map((n) => all[n][i].audienceHash)).size !== 1)
      throw Error("Paired audiences differ");
  const describe = (x: number[]) => {
    const mean = x.length ? x.reduce((a, b) => a + b, 0) / x.length : null;
    return {
      n: x.length,
      mean,
      sd:
        x.length > 1
          ? Math.sqrt(
              x.reduce((a, b) => a + (b - mean!) ** 2, 0) / (x.length - 1),
            )
          : null,
      min: x.length ? Math.min(...x) : null,
      median: quantile(x, 0.5),
      p05: quantile(x, 0.05),
      p95: quantile(x, 0.95),
      max: x.length ? Math.max(...x) : null,
    };
  };
  const summaries = Object.fromEntries(
    names.map((name) => {
      const rows = all[name],
        t = rows.flatMap((r) => (r.clearance === null ? [] : [r.clearance]));
      return [
        name,
        {
          ...summarize(rows as RunResult[]),
          completedOnly: describe(t),
          restrictedMean900:
            rows.reduce((a, r) => a + (r.clearance ?? 900), 0) / count,
          meanOutside180: rows.reduce((a, r) => a + r.outside180, 0) / count,
          meanWait: rows.reduce((a, r) => a + r.meanWait, 0) / count,
          meanDensePersonSeconds:
            rows.reduce((a, r) => a + r.densePersonSeconds, 0) / count,
          accessibleOutside: rows.reduce(
            (a, r) =>
              a + r.accessible.filter((p: any) => p.exitTime !== null).length,
            0,
          ),
          accessibleStreet: rows.reduce(
            (a, r) =>
              a + r.accessible.filter((p: any) => p.streetTime !== null).length,
            0,
          ),
          exitUsage: Object.fromEntries(
            Object.keys(rows[0].exitUsage).map((e) => [
              e,
              rows.reduce((a, r) => a + r.exitUsage[e], 0) / count,
            ]),
          ),
        },
      ];
    }),
  );
  const paired = Object.fromEntries(
    names
      .slice(1)
      .map((name) => [
        name,
        describe(
          all[name].flatMap((r, i) =>
            r.clearance !== null && all[names[0]][i].clearance !== null
              ? [r.clearance - all[names[0]][i].clearance]
              : [],
          ),
        ),
      ]),
  );
  await json(join(out, "summary.json"), {
    engineVersion: ENGINE_VERSION,
    sourceHash,
    wallSeconds: (Date.now() - started) / 1000,
    summaries,
    pairedTo: names[0],
    paired,
    all,
  });
  const fields = [
    "policy",
    "seed",
    "status",
    "clearance",
    "outside",
    "outside180",
    "success180",
    "queueMax",
    "meanWait",
    "audienceHash",
  ];
  await writeFile(
    join(out, "replications.csv"),
    fields.join(",") +
      "\n" +
      names
        .flatMap((policy) =>
          all[policy].map((r) =>
            fields
              .map((f) => (f === "policy" ? policy : (r[f] ?? "")))
              .join(","),
          ),
        )
        .join("\n") +
      "\n",
  );
  console.log(JSON.stringify(summaries, null, 2));
}
