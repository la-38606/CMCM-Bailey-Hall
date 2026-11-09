import { describe, expect, it } from "vitest";
import { reference, scenarios } from "../src/engine/config";
import {
  buildGeometry,
  lanes,
  reachable,
  validateGeometry,
} from "../src/engine/geometry";
import { generatePopulation } from "../src/engine/population";
import {
  accrue,
  allocateContinuousLanes,
  allocateLanes,
  gateCapacity,
  newLinkState,
  receivingLane,
  walkingCapacity,
} from "../src/engine/transport";
import { clearSight, signVisible, visible } from "../src/engine/perception";
import { chooseDestination, routes } from "../src/engine/routing";
import { Assistance } from "../src/engine/assistance";
import { RNG } from "../src/engine/rng";
import { Simulation } from "../src/engine/simulation";
import { paired, summarize } from "../src/engine/metrics";
import type { Config, Geometry, Lane, SignConfig } from "../src/engine/types";
const c = reference(),
  g = buildGeometry(c),
  people = generatePopulation(g, c, 101);
describe("source population and independent named randomness", () => {
  it("accounts for exact section totals and three accessible users once", () => {
    expect(people).toHaveLength(1329);
    expect(new Set(people.map((p) => p.id)).size).toBe(1329);
    expect(people.filter((p) => p.section === "orchestra")).toHaveLength(527);
    expect(people.filter((p) => p.section === "mezzanine")).toHaveLength(486);
    expect(people.filter((p) => p.section === "balcony")).toHaveLength(316);
    expect(people.filter((p) => p.wheelchair)).toHaveLength(3);
  });
  it("preserves fixed traits and preferences across interventions", () => {
    for (const config of Object.values(scenarios()).filter(
      (x) =>
        x.speedMean === c.speedMean &&
        x.olderShare === c.olderShare &&
        x.responseMedian === c.responseMedian &&
        x.knowledge === c.knowledge,
    )) {
      expect(generatePopulation(buildGeometry(config), config, 101)).toEqual(
        people,
      );
    }
  });
  it("bounds speeds, body dimensions and seats adjacent companions together", () => {
    for (const p of people) {
      expect(p.speed).toBeGreaterThanOrEqual(0.5);
      expect(p.speed).toBeLessThanOrEqual(2);
      if (p.wheelchair) {
        expect(p.speed).toBe(0.8);
        expect(p.radius).toBe(0.45);
      } else {
        expect(p.radius).toBeGreaterThanOrEqual(0.17);
        expect(p.radius).toBeLessThanOrEqual(0.3);
      }
      for (const id of p.group) expect(people[id].row).toBe(p.row);
    }
    expect(people.filter((p) => p.group.length).length / 1329).toBeGreaterThan(
      0.4,
    );
    expect(people.filter((p) => p.group.length).length / 1329).toBeLessThan(
      0.65,
    );
  });
  it("uses repeatable nonconstant named streams", () => {
    const a = new RNG(5, "a"),
      b = new RNG(5, "a"),
      d = new RNG(5, "different");
    expect(Array.from({ length: 100 }, () => a.uniform())).toEqual(
      Array.from({ length: 100 }, () => b.uniform()),
    );
    expect(d.uniform()).not.toBe(new RNG(5, "a").uniform());
  });
});
describe("plan geometry and accessibility", () => {
  it("preserves the documented door and access topology", () => {
    expect(validateGeometry(g, c)).toEqual([]);
    const links = Object.keys(g.links);
    expect(links.filter((x) => x.startsWith("auditorium-door"))).toHaveLength(
      9,
    );
    expect(links.filter((x) => x.startsWith("portico-door"))).toHaveLength(4);
    expect(links.filter((x) => x.startsWith("foyer-door-"))).toHaveLength(3);
    expect(links.filter((x) => x.startsWith("foyer-exit"))).toHaveLength(5);
    expect(links.filter((x) => x.startsWith("access-"))).toHaveLength(6);
    expect(links.some((x) => x.includes("elevator"))).toBe(false);
  });
  it("makes both stepped cross-aisles public, connected stairs, never rows", () => {
    for (const side of ["L", "R"]) {
      const e = g.links[`cross-step-${side}`];
      expect(e.kind).toBe("stair");
      expect(e.row).toBeUndefined();
      expect(e.drop).toBe(0.54);
      expect(e.length).toBeGreaterThan(e.plan);
      expect(e.accessible).toBe(false);
      expect(g.adjacency[e.a].some((a) => a.to === e.b)).toBe(true);
      expect(g.adjacency[e.b].some((a) => a.to === e.a)).toBe(true);
    }
  });
  it("preserves exterior paths from each wheelchair origin without stairs", () => {
    for (const row of g.rows.filter((r) => r.wheelchair)) {
      const reached = reachable(g, row.ends[0], true);
      expect([...reached].some((n) => g.nodes[n].exit)).toBe(true);
      const p = people.find((p) => p.row === row.id)!;
      for (const route of routes(g, c, row.ends[0], p).values())
        for (const id of route.links) expect(g.links[id].accessible).toBe(true);
    }
  });
  it("never routes through someone else’s seating row", () => {
    const p = people[0];
    for (const route of routes(g, c, "m3", p).values())
      expect(route.links.every((id) => g.links[id].kind !== "row")).toBe(true);
    for (const row of g.rows)
      for (const id of row.links)
        expect(g.adjacency[g.links[id].b].some((a) => a.link === id)).toBe(
          false,
        );
  });
  it("uses explicit metric provenance and two divided balcony stair lanes", () => {
    for (const e of Object.values(g.links))
      expect(e.provenance.length).toBeGreaterThan(20);
    expect(g.links["west-stair-upper"].lanes).toBe(2);
    expect(g.links["east-stair-lower"].lanes).toBe(2);
  });
  it("projects belts into width and detour and rejects unsafe or non-slot placements", () => {
    const b = buildGeometry(scenarios().barriers),
      e = b.links["corridor-4"],
      original = g.links[e.id];
    expect(e.width).toBeCloseTo(2.4 - 1.2 * Math.sin(Math.PI / 4));
    expect(e.plan).toBeGreaterThan(original.plan);
    expect(e.lanes).toBeLessThan(original.lanes);
    expect(() =>
      buildGeometry({
        ...c,
        barriers: [
          { link: "corridor-4", length: 1.5, angle: 90, direction: "both" },
        ],
      }),
    ).toThrow(/1.1/);
    expect(() =>
      buildGeometry({
        ...c,
        barriers: [
          {
            link: "auditorium-door-4",
            length: 1,
            angle: 90,
            direction: "both",
          },
        ],
      }),
    ).toThrow(/slot/);
  });
});
describe("finite storage, gates, shared counterflow and service credits", () => {
  it("floors 1.8 m to exactly 3 lanes without duplicated directional capacity", () => {
    expect(lanes(1.8)).toBe(3);
    const ls: Lane[] = Array.from({ length: 3 }, () => ({
      direction: 0,
      people: [],
      credit: 0,
    }));
    allocateLanes(ls, [1, 2]);
    expect(ls.filter((l) => l.direction === 1)).toHaveLength(2);
    expect(ls.filter((l) => l.direction === -1)).toHaveLength(1);
    allocateLanes(ls, [3, 2]);
    expect(ls.filter((l) => l.direction === -1)).toHaveLength(2);
    expect(ls.filter((l) => l.direction !== 0)).toHaveLength(3);
  });
  it("never reverses an occupied lane; drains excess lanes before reallocating", () => {
    const ls: Lane[] = [
      { direction: 1, people: [0], credit: 0.4 },
      { direction: 1, people: [1], credit: 0.4 },
    ];
    allocateLanes(ls, [0, 1]);
    expect(ls.map((l) => l.direction)).toEqual([1, 1]);
    expect(ls.filter((l) => l.accepting)).toHaveLength(1);
    ls[1].people = [];
    allocateLanes(ls, [0, 1]);
    expect(ls.map((l) => l.direction)).toEqual([1, -1]);
  });
  it("keeps logical lanes continuous across adjacent aisle segments", () => {
    const a = newLinkState(g.links["inner-L-1"]),
      b = newLinkState(g.links["inner-L-2"]);
    a.lanes[0].direction = 1;
    a.lanes[0].people = [1];
    a.requests = [1, Infinity];
    b.requests = [Infinity, 2];
    allocateContinuousLanes({ a, b }, [["a", "b"]]);
    expect(a.lanes.map((l) => l.direction)).toEqual(
      b.lanes.map((l) => l.direction),
    );
    expect(b.lanes.map((l) => l.direction)).toEqual([1, -1]);
  });
  it("allows an atomic return to a different lane without inventing storage", () => {
    const e = { ...g.links["inner-L-1"], storage: 3 },
      s = newLinkState(e);
    s.lanes[0] = { direction: 1, people: [1], credit: 1, accepting: true };
    s.lanes[1] = { direction: -1, people: [2], credit: 1, accepting: true };
    expect(receivingLane(e, s, -1, 0.22, 0)).toBe(0);
    expect(s.lanes[0].people).toEqual([1]);
  });
  it("reserves narrow passage width for wheelchair bodies", () => {
    const e = g.links["m-radial-4-1"],
      s = newLinkState(e);
    allocateLanes(s.lanes, [0, Infinity]);
    s.lanes[0].people = [800];
    s.wheelchairCount = 1;
    expect(receivingLane(e, s, 1, 0.22)).toBe(-1);
  });
  it("does not admit opposite directions simultaneously through a one-lane passage", () => {
    const ls: Lane[] = [{ direction: 1, people: [5], credit: 0.9 }];
    allocateLanes(ls, [2, 1]);
    expect(ls[0].direction).toBe(1);
    expect(ls[0].accepting).toBe(false);
    ls[0].people = [];
    allocateLanes(ls, [2, 1]);
    expect(ls[0].direction).toBe(-1);
  });
  it("uses zero effective gate width and the exact 1.17 p/s door formula", () => {
    const door = { ...g.links["auditorium-door-1"], width: 1.2 };
    expect(gateCapacity(door, c)).toBeCloseTo(1.17, 12);
    expect(gateCapacity({ ...door, width: 0.25 }, c)).toBe(0);
    expect(gateCapacity({ ...door, closed: true }, c)).toBe(0);
    expect(gateCapacity(g.links["west-stair-upper"], c)).toBeCloseTo(1.44);
  });
  it.each([0.1, 0.0125])(
    "converges to saturated fractional throughput at dt=%s",
    (dt) => {
      let credit = 0,
        n = 0;
      for (let i = 0; i < Math.round(100 / dt); i++) {
        credit = accrue(credit, 1.17, dt);
        if (credit + 1e-9 >= 1) {
          credit -= 1;
          n++;
        }
      }
      expect(n).toBe(117);
      expect(credit).toBeCloseTo(0, 8);
    },
  );
  it("caps idle credit and preserves credits on a blocked receiving attempt", () => {
    let credit = 0;
    for (let i = 0; i < 10000; i++) credit = accrue(credit, 1.17, 0.1);
    expect(credit).toBeLessThanOrEqual(1.117);
    const e = { ...g.links["corridor-1"], storage: 1 },
      s = newLinkState(e);
    s.lanes[0].direction = 1;
    s.lanes[0].people = [5];
    s.gateCredit = 0.77;
    expect(receivingLane(e, s, 1, 0.22)).toBe(-1);
    expect(s.gateCredit).toBe(0.77);
    expect(s.lanes[0].people).toEqual([5]);
  });
  it("uses headway service and strict body fit", () => {
    expect(walkingCapacity(3, 1.4)).toBeCloseTo(4.2 / 1.42);
    const e = { ...g.links["corridor-1"], width: 0.8 },
      s = newLinkState(e);
    allocateLanes(s.lanes, [0, Infinity]);
    expect(receivingLane(e, s, 1, 0.45)).toBe(-1);
  });
});
describe("local information and persistent choice", () => {
  const sign: SignConfig = {
    id: "test",
    node: "m1",
    exit: "west-portico",
    kind: "wall",
    dynamic: false,
    existing: false,
    facing: [1, 0],
    activation: 3,
    range: 8,
    detection: 0.77,
    acceptance: 0.8,
    halfAngle: 70,
  };
  it("respects floor, range, facing, activation and wall occlusion", () => {
    const n = g.nodes.m1;
    expect(signVisible(g, { x: n.x + 1, y: n.y, floor: 0 }, sign, 2)).toBe(
      false,
    );
    expect(signVisible(g, { x: n.x - 1, y: n.y, floor: 0 }, sign, 4)).toBe(
      false,
    );
    expect(signVisible(g, { x: n.x + 1, y: n.y, floor: 1 }, sign, 4)).toBe(
      false,
    );
    expect(signVisible(g, { x: n.x + 9, y: n.y, floor: 0 }, sign, 4)).toBe(
      false,
    );
    const test = {
      ...g,
      walls: [
        {
          a: { x: n.x + 0.5, y: n.y - 2, floor: 0 },
          b: { x: n.x + 0.5, y: n.y + 2, floor: 0 },
          source: "test",
        },
      ],
    };
    expect(signVisible(test, { x: n.x + 1, y: n.y, floor: 0 }, sign, 4)).toBe(
      false,
    );
    expect(
      signVisible(
        { ...test, walls: [], columns: [] },
        { x: n.x + 1, y: n.y, floor: 0 },
        sign,
        4,
      ),
    ).toBe(true);
    expect(clearSight(test, n, { x: n.x + 1, y: n.y, floor: 0 })).toBe(false);
  });
  it("does not reveal unseen closures to the pathfinder", () => {
    const blocked = buildGeometry(scenarios()["blocked-exit"]),
      p = people[0];
    const options = routes(blocked, c, "c1", p);
    expect(options.get("west-portico")?.links).toContain("portico-door-1");
    const learned = routes(blocked, c, "c1", {
      ...p,
      blocked: new Set(["portico-door-1", "portico-door-3"]),
    });
    expect(learned.has("west-portico")).toBe(false);
    expect(visible(g, g.nodes.oL0, g.nodes["foyer-doorway-1"])).toBe(false);
  });
  it("applies 8-second utility inertia and feasible instruction precedence", () => {
    const p = {
      ...people[0],
      known: ["foyer", "west-portico"] as PersonExits,
      destination: "foyer" as const,
      familiarity: 0,
      taste: { ...people[0].taste, foyer: 0, "west-portico": 0 },
    };
    let opts = new Map([
      ["foyer", { time: 20, links: [] }],
      ["west-portico", { time: 13, links: [] }],
    ]) as Parameters<typeof chooseDestination>[1];
    expect(chooseDestination(p, opts)).toBe("foyer");
    opts.set("west-portico", { time: 12, links: [] });
    expect(chooseDestination(p, opts)).toBe("west-portico");
    expect(
      chooseDestination(
        { ...p, guidance: { source: "CM1", exit: "foyer", priority: 3 } },
        opts,
      ),
    ).toBe("foyer");
  });
});
type PersonExits = (typeof people)[0]["known"];
describe("assistance, endpoints and censoring", () => {
  it("uses two teams from 60 s, with FIFO scarce assistance after exterior crossing", () => {
    const a = new Assistance(1),
      wheel = people.filter((p) => p.wheelchair).map((p) => ({ ...p }));
    const jobs = wheel.map((p) => a.assign(p, 30));
    expect(jobs[0].start).toBe(60);
    expect(jobs[1].start).toBe(60);
    expect(jobs[2].start).toBe(Math.min(jobs[0].end, jobs[1].end));
    expect(jobs.every((j) => j.end > j.start)).toBe(true);
  });
  it("keeps unresolved results in the success denominator and does not invent a mean", () => {
    const s = new Simulation({ ...c, cutoff: 1 }, 1);
    const r = s.run();
    expect(r.status).toBe("unresolved");
    expect(r.clearance).toBeNull();
    expect(r.clearanceBound).toBe("T > 1 s");
    const complete = {
      ...r,
      status: "complete" as const,
      clearance: 170,
      success180: true,
    };
    const summary = summarize([r, complete]);
    expect(summary.success180).toBe(0.5);
    expect(summary.mean).toBeNull();
    expect(summary.completedOnlyMean).toBe(170);
    expect(summary.quantilesAreConditional).toBe(true);
    expect(paired([r], [complete])[0].delta).toBeNull();
  });
});
