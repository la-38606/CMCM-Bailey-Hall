import { afterAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { reference, scenarios } from "../src/engine/config";
import { Simulation } from "../src/engine/simulation";
import { occupancy } from "../src/engine/transport";
import type { RunResult, Person } from "../src/engine/types";
const temp = await mkdtemp(join(tmpdir(), "bailey-tests-"));
afterAll(() => rm(temp, { recursive: true, force: true }));
describe("whole-engine validation", () => {
  it("uses the destination floor at a completed stair and the entry floor while travelling", () => {
    const sim = new Simulation(reference(), 101),
      p = sim.people[0],
      e = sim.geometry.links["west-stair-lower"];
    p.link = e.id;
    p.dir = 1;
    p.node = e.a;
    p.remaining = 0;
    expect(sim.position(p).floor).toBe(sim.geometry.nodes[e.b].floor);
    p.remaining = e.length / 2;
    expect(sim.position(p).floor).toBe(sim.geometry.nodes[e.a].floor);
    p.dir = -1;
    p.node = e.b;
    expect(sim.position(p).floor).toBe(sim.geometry.nodes[e.b].floor);
    p.remaining = 0;
    expect(sim.position(p).floor).toBe(sim.geometry.nodes[e.a].floor);
  });

  it("lets solo occupants and group leaders reconsider their own destination", () => {
    const sim = new Simulation(reference(), 101),
      p = sim.people[0];
    p.leader = p.id;
    p.group = [];
    p.guidance = undefined;
    p.familiarity = 0;
    p.known = ["foyer", "west-portico"];
    p.destination = "foyer";
    p.taste.foyer = 0;
    p.taste["west-portico"] = 0;
    (sim as unknown as { review(p: Person, node: string): void }).review(
      p,
      "c1",
    );
    expect(p.destination).toBe("west-portico");
  });

  it("conserves occupants under spillback, respects storage and positive travel in every tick", () => {
    const s = new Simulation(reference(), 101);
    let queued = false;
    for (let i = 0; i < 1400; i++) {
      const before = s.people.map((p) => ({
        link: p.link,
        remaining: p.remaining,
      }));
      s.step();
      s.assertInvariants();
      for (const p of s.people) {
        if (p.link && p.link !== before[p.id].link)
          expect(p.entered).toBe(s.time);
        if (p.link && p.entered === s.time)
          expect(p.remaining).toBeGreaterThan(0);
      }
      queued ||= s.people.some((p) => p.state === "queuing");
      for (const [id, state] of Object.entries(s.links))
        expect(occupancy(state)).toBeLessThanOrEqual(
          s.geometry.links[id].storage,
        );
    }
    expect(queued).toBe(true);
    expect(s.outside + s.people.filter((p) => p.exitTime === null).length).toBe(
      1329,
    );
  }, 30000);
  it("matches browser-bundled engine, direct execution and CLI full event results", async () => {
    const c = { ...reference(), cutoff: 80 };
    const direct = new Simulation(c, 28).run();
    await build({
      entryPoints: ["src/engine/simulation.ts"],
      bundle: true,
      format: "esm",
      platform: "browser",
      outfile: join(temp, "browser.mjs"),
    });
    await writeFile(join(temp, "config.json"), JSON.stringify(c));
    execFileSync(process.execPath, [
      "--input-type=module",
      "-e",
      `import {Simulation} from ${JSON.stringify(join(temp, "browser.mjs"))};import {readFileSync,writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(join(temp, "browser.json"))},JSON.stringify(new Simulation(JSON.parse(readFileSync(${JSON.stringify(join(temp, "config.json"))},'utf8')),28).run()));`,
    ]);
    expect(
      JSON.parse(await readFile(join(temp, "browser.json"), "utf8")),
    ).toEqual(direct);
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/simulate.ts",
        "--config",
        join(temp, "config.json"),
        "--seed",
        "28",
        "--out",
        join(temp, "cli.json"),
      ],
      { cwd: process.cwd() },
    );
    expect(JSON.parse(await readFile(join(temp, "cli.json"), "utf8"))).toEqual(
      direct,
    );
  }, 30000);
  it("learns closures only through local observations or logged guidance, with actual spillback", () => {
    const s = new Simulation(
      { ...scenarios()["blocked-exit"], cutoff: 140 },
      101,
    );
    expect(s.people.every((p) => !p.blocked.size)).toBe(true);
    s.run();
    const events = s.events.filter((e) => e.type === "learned-closure");
    expect(events.length).toBeGreaterThan(0);
    expect(
      events.every((e) =>
        /locally visible|entrance|reported by|via/.test(e.detail),
      ),
    ).toBe(true);
    expect(s.people.some((p) => p.blocked.size)).toBe(true);
    expect(s.people.some((p) => !p.blocked.size)).toBe(true);
    expect(s.result().queueMax).toBeGreaterThan(0);
  }, 30000);
  it("distinguishes accessible exterior crossing from scarce-team street arrival", () => {
    const s = new Simulation({ ...reference(), cutoff: 300 }, 101);
    s.run();
    const r = s.result();
    expect(r.accessible.every((p) => p.exitTime !== null)).toBe(true);
    for (const p of r.accessible) {
      if (p.streetTime !== null)
        expect(p.streetTime).toBeGreaterThan(p.exitTime!);
    }
    expect(
      s.events.filter((e) => e.type === "assistance-assigned"),
    ).toHaveLength(3);
    expect(
      r.exitUsage.foyer +
        r.exitUsage["west-portico"] +
        r.exitUsage["east-portico"],
    ).toBeGreaterThan(3);
  }, 30000);
  it("retains conservation and reproducibility under 0.0125 s refinement", () => {
    const config = { ...reference(), cutoff: 30, dt: 0.0125 },
      fine = new Simulation(config, 5),
      coarse = new Simulation({ ...config, dt: 0.1 }, 5);
    fine.run();
    coarse.run();
    fine.assertInvariants();
    coarse.assertInvariants();
    expect(
      fine.people.map((p) => [p.speed, p.recognition, p.response, p.group]),
    ).toEqual(
      coarse.people.map((p) => [p.speed, p.recognition, p.response, p.group]),
    );
    expect(fine.time).toBe(30);
    expect(fine.result()).toEqual(new Simulation(config, 5).run());
  }, 30000);
  it("does not transfer invisible or rejected sign messages by repeated exposure", () => {
    const c = reference();
    c.managers = [];
    c.signs = [
      {
        id: "invisible",
        node: "b6",
        kind: "wall",
        exit: "northwest-balcony",
        dynamic: false,
        existing: false,
        facing: [0, 1],
        activation: 0,
        range: 8,
        detection: 1,
        acceptance: 1,
        halfAngle: 70,
      },
      {
        id: "reject",
        node: "m6",
        kind: "strip",
        link: "mezzanine-6",
        exit: "foyer",
        dynamic: false,
        existing: false,
        facing: [0, 1],
        activation: 0,
        range: 100,
        detection: 1,
        acceptance: 0,
        halfAngle: 70,
      },
    ];
    c.cutoff = 30;
    const s = new Simulation(c, 1);
    s.run();
    expect(
      s.people
        .filter((p) => p.section !== "balcony")
        .every((p) => ![...p.noticed].some((x) => x.startsWith("invisible:"))),
    ).toBe(true);
    expect(s.people.every((p) => p.guidance?.source !== "reject")).toBe(true);
    expect(
      s.events.some(
        (e) => e.type === "noticed-sign" && e.detail.startsWith("reject:"),
      ),
    ).toBe(true);
  }, 30000);
  it("requires delayed observations and 20-second holds for public dynamic messages", () => {
    const s = new Simulation(
      { ...scenarios()["dynamic-led"], cutoff: 80 },
      101,
    );
    s.run();
    const changes = s.events.filter((e) => e.type === "sign-message");
    expect(changes.length).toBeGreaterThan(0);
    for (const e of changes) expect(e.time).toBeGreaterThanOrEqual(23);
    for (const sign of s.guidance.signs.filter((s) => s.config.dynamic)) {
      const times = changes
        .filter((e) => e.detail.startsWith(sign.config.id + " "))
        .map((e) => e.time);
      for (let i = 1; i < times.length; i++)
        expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(20);
    }
    for (const report of s.guidance.reports.values())
      expect(report.deliveryAt - report.at).toBe(5);
  }, 30000);
});
