import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emergency, reference, validateConfig } from "../src/engine/config";
import { Simulation } from "../src/engine/simulation";
import {
  nearestKnownExit,
  routes,
  visibleQueueWaits,
} from "../src/engine/routing";
import type { Person } from "../src/engine/types";

function tailFixture(count = 1, dt = 0.1) {
  const c = emergency();
  c.dt = dt;
  const s = new Simulation(c, 101);
  for (const p of s.people.slice(count)) {
    p.exitTime = 0;
    p.streetTime = 0;
    p.state = "street";
  }
  const p = s.people[0],
    edge = s.geometry.links["auditorium-door-1"];
  Object.assign(p, {
    link: edge.id,
    node: edge.a,
    dir: 1,
    lane: 0,
    remaining: 0,
    state: "queuing",
    queueAt: 0,
    destination: "foyer",
    known: ["foyer", "west-portico"],
    route: [],
    familiarity: 1000,
    guidance: { source: "old-manager", exit: "foyer", priority: 3 },
  });
  p.taste.foyer = 10000;
  s.links[edge.id].lanes[0].people = [p.id];
  s.links[edge.id].lanes[0].direction = 1;
  const check = () =>
    (s as unknown as { updateTailCommitments(): void }).updateTailCommitments();
  const at = (time: number) => {
    s.scheduler.tick = Math.round(time / dt);
    check();
  };
  return { s, p, at, check };
}

describe("nearest-time manager instructions", () => {
  it("keeps JSON, browser preset and CLI default aligned; retains the historical reference", () => {
    expect(
      JSON.parse(readFileSync("scenarios/emergency.json", "utf8")),
    ).toEqual(emergency());
    expect(
      emergency()
        .managers.slice(0, 4)
        .map((m) => m.exit),
    ).toEqual(Array(4).fill("nearest-time"));
    expect(emergency().managers.slice(4)).toEqual(
      reference().managers.slice(4),
    );
    expect(reference().tailFallback).toBeUndefined();
    expect(validateConfig(emergency())).toEqual([]);
  });
  it("uses time including visible queue delay, not habits, distance alone or unseen queues", () => {
    const { s, p } = tailFixture();
    const node = s.geometry.nodes.c1;
    const options = (q: Map<string, number>) =>
      routes(
        s.geometry,
        s.config,
        "c1",
        p,
        visibleQueueWaits(s.geometry, s.config, node, q),
      );
    expect(nearestKnownExit(p, options(new Map()))?.[0]).toBe("west-portico");
    const queues = new Map(
      Object.values(s.geometry.links)
        .filter(
          (e) =>
            e.id.startsWith("portico-door-") &&
            s.geometry.nodes[e.b].exit === "west-portico",
        )
        .map((e) => [e.id, 100]),
    );
    expect(nearestKnownExit(p, options(queues))?.[0]).toBe("foyer");
    expect(options(new Map([["east-balcony-door", 10000]]))).toEqual(
      options(new Map()),
    );
  });
  it("broadcasts a rule; listeners choose from their current reachable position", () => {
    const { s, p } = tailFixture();
    p.destination = undefined;
    p.guidance = undefined;
    p.compliance = 0;
    const m = s.guidance.managers[0];
    m.activation = 0;
    m.position = s.geometry.nodes.c1;
    for (const other of s.guidance.managers.slice(1))
      other.activation = Infinity;
    s.guidance.signs = [];
    for (let time = 0; time < 100 && !p.guidance; time++)
      s.guidance.update(
        time,
        s.people,
        s.links,
        (q) => s.position(q),
        new Map(),
      );
    expect(m.message).toBe("nearest-time");
    expect((p as Person).guidance?.exit).toBe("west-portico");
    expect(
      s.events.some(
        (e) =>
          e.type === "accepted-manager" && e.detail.includes("nearest-time"),
      ),
    ).toBe(true);
  });
  it("rejects malformed fallback values and a nearest-time LED message", () => {
    const c = emergency();
    c.tailFallback = { remaining: 40.5, stalledSeconds: 0 };
    expect(validateConfig(c).join(" ")).toMatch(/Tail fallback/);
    c.tailFallback = { remaining: 40, stalledSeconds: 10 };
    c.signs = [{ id: "invalid", node: "c1", exit: "nearest-time" } as never];
    expect(validateConfig(c).join(" ")).toMatch(/Invalid signs/);
  });
});

describe("final forty: one-time current-state commitment", () => {
  it.each([0.1, 0.0125])(
    "requires strictly more than 10 seconds in the final phase at dt=%s",
    (dt) => {
      const { s, p, at } = tailFixture(41, dt);
      at(100);
      expect(p.finalCommitment).toBeUndefined();
      Object.assign(s.people[40], {
        exitTime: 110,
        streetTime: 110,
        state: "street",
      });
      at(110);
      at(120);
      expect(p.finalCommitment).toBeUndefined();
      at(120 + dt);
      expect(p.finalCommitment?.at).toBeCloseTo(120 + dt);
      expect(p.destination).toBe("west-portico");
      expect(p.guidance).toBeUndefined();
      expect(p.familiarity).toBe(1000); // Traits retained; they no longer govern this choice.
      expect(
        s.events.filter((e) => e.type === "tail-final-commitment"),
      ).toHaveLength(1);
      s.assertInvariants();
    },
  );
  it("does not mistake movement, preparation or a completed exterior approach for a stall", () => {
    const { p, at, s } = tailFixture();
    at(0);
    p.remaining = 0.01;
    p.state = "moving";
    at(20);
    expect(p.finalCommitment).toBeUndefined();
    p.remaining = 0;
    p.state = "queuing";
    p.queueAt = 20;
    at(30);
    expect(p.finalCommitment).toBeUndefined();
    p.link = "portico-door-1";
    p.node = s.geometry.links[p.link].a;
    at(31);
    expect(p.finalCommitment).toBeUndefined();
    p.link = null;
    p.state = "response";
    at(60);
    expect(p.finalCommitment).toBeUndefined();
  });
  it("resets the stall after progress and never triggers on accumulated earlier waits", () => {
    const { p, at } = tailFixture();
    at(0);
    at(9);
    p.state = "moving";
    p.remaining = 1;
    at(10);
    p.state = "queuing";
    p.remaining = 0;
    p.queueAt = 11;
    at(20);
    at(21);
    expect(p.finalCommitment).toBeUndefined();
    at(21.1);
    expect(p.finalCommitment).toBeDefined();
  });
  it("ignores later signs, managers, queues and companion choices, while preserving positive-length travel", () => {
    const { s, p, at } = tailFixture();
    at(0);
    at(10.1);
    const choice = structuredClone(p.finalCommitment),
      initialRoute = [...p.route];
    p.compliance = 0;
    const m = s.guidance.managers[0];
    m.config.exit = "foyer";
    m.message = "foyer";
    m.position = s.geometry.nodes.c1;
    m.activation = 0;
    for (let time = 11; time < 30; time++)
      s.guidance.update(
        time,
        s.people,
        s.links,
        (q) => s.position(q),
        new Map([["portico-door-1", 1000]]),
      );
    expect(p.finalCommitment).toEqual(choice);
    expect(p.guidance).toBeUndefined();
    expect(p.route).toEqual(initialRoute);
    for (let i = 0; i < 400 && p.exitTime === null; i++) {
      const before = p.link;
      s.step();
      if (p.link && p.link !== before) expect(p.remaining).toBeGreaterThan(0);
      expect(p.finalCommitment).toEqual(choice);
      expect(p.destination).toBe("west-portico");
      s.assertInvariants();
    }
    expect(p.exit).toBe("west-portico");
    const later = s.events.filter(
      (e) => e.person === p.id && e.time > choice!.at,
    );
    expect(
      later.some((e) =>
        [
          "route-choice",
          "route-review",
          "accepted-manager",
          "noticed-sign",
          "accepted-sign",
        ].includes(e.type),
      ),
    ).toBe(false);
  });
  it("does not invent knowledge or bypass known obstructions", () => {
    const { s, p, at } = tailFixture();
    p.known = ["west-portico"];
    for (const e of Object.values(s.geometry.links))
      if (s.geometry.nodes[e.b].exit === "west-portico") p.blocked.add(e.id);
    at(0);
    at(20);
    expect(p.finalCommitment).toBeUndefined();
  });
  it("chooses an accessible path for a wheelchair user", () => {
    const { s, p, at } = tailFixture();
    p.wheelchair = true;
    p.radius = 0.45;
    p.speed = 0.8;
    s.links[p.link!].wheelchairCount = 1;
    p.known = ["foyer", "west-portico", "west-stage", "northwest-balcony"];
    at(0);
    at(10.1);
    expect(p.finalCommitment).toBeDefined();
    expect(p.route.every((id) => s.geometry.links[id].accessible)).toBe(true);
    s.assertInvariants();
  });
});

it("uses the current queue snapshot rather than a stale queue-count cache for the final choice", () => {
  const { s, p, at } = tailFixture();
  p.route = ["portico-door-1"];
  s.queueCounts.set("portico-door-1", 10000);
  at(0);
  at(10.1);
  expect(p.destination).toBe("west-portico");
  const expected = nearestKnownExit(
    p,
    routes(
      s.geometry,
      s.config,
      "c1",
      p,
      visibleQueueWaits(
        s.geometry,
        s.config,
        s.geometry.nodes.c1,
        new Map([["portico-door-1", 1]]),
      ),
    ),
  );
  expect(p.finalCommitment?.estimatedSeconds).toBeCloseTo(expected![1].time);
});

it("does not bypass a newly closed link or silently change a locked route", () => {
  const { s, p, at } = tailFixture();
  at(0);
  at(10.1);
  const locked = structuredClone(p.finalCommitment),
    path = [...p.route];
  s.geometry.links[path[0]].closed = true;
  s.step(150);
  expect(p.exitTime).toBeNull();
  expect(p.finalCommitment).toEqual(locked);
  expect(p.route).toEqual(path);
  s.assertInvariants();
});
