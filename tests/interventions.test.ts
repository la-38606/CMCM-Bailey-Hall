import { describe, expect, it } from "vitest";
import { reference } from "../src/engine/config";
import { interventionCandidates } from "../src/engine/interventions";
import { buildGeometry, validateGeometry } from "../src/engine/geometry";
import { generatePopulation } from "../src/engine/population";
import { Simulation } from "../src/engine/simulation";
import {
  gateCapacity,
  newLinkState,
  receivingLane,
} from "../src/engine/transport";
import { guidanceSwitchAllowed } from "../src/engine/routing";

describe("literature study: physical corrections and intervention isolation", () => {
  it("keeps both divided stair lanes continuous through flights and approaches", () => {
    const g = buildGeometry(reference());
    for (const side of ["west", "east"]) {
      const chain = [
        "balcony-rear",
        "stair-upper",
        "stair-lower",
        "stair-corridor",
      ].map((id) => g.links[`${side}-${id}`]);
      expect(new Set(chain.map((e) => e.laneFamily)).size).toBe(1);
      expect(chain.every((e) => e.lanes === 2)).toBe(true);
      for (let i = 1; i < chain.length; i++)
        expect(chain[i - 1].b).toBe(chain[i].a);
      expect(gateCapacity(chain[1], reference())).toBeCloseTo(1.44);
    }
  });
  it("preserves lane continuity across the public stepped cross-aisle", () => {
    const g = buildGeometry(reference());
    for (const side of ["L", "R"]) {
      const chain = ["outer", "curve", "step", "inner"].map(
        (part) => g.links[`cross-${part}-${side}`],
      );
      expect(new Set(chain.map((e) => e.laneFamily)).size).toBe(1);
      expect(chain.every((e) => e.lanes === 2)).toBe(true);
    }
  });
  it.each([3011, 3015, 3020])(
    "clears cross-aisle regression seed %i",
    (seed) => {
      const c = interventionCandidates(reference())["dynamic-only"];
      const sim = new Simulation(c, seed);
      const r = sim.run();
      sim.assertInvariants();
      expect(r.status).toBe("complete");
      expect(r.outside).toBe(1329);
    },
    60000,
  );
  it("lets existing traffic drain a closing logical lane without admitting new traffic", () => {
    const g = buildGeometry(reference()),
      e = g.links["inner-L-1"],
      state = newLinkState(e);
    state.lanes[0] = { direction: 1, people: [10], credit: 1, accepting: true };
    state.lanes[1] = { direction: 1, people: [], credit: 1, accepting: false };
    expect(receivingLane(e, state, 1, 0.22, undefined, true, 1)).toBe(1);
    state.lanes[0].people = Array(Math.ceil(e.storage / 2)).fill(10);
    expect(receivingLane(e, state, 1, 0.22)).toBe(-1);
    expect(receivingLane(e, state, -1, 0.22, undefined, true, 1)).toBe(-1);
  });
  it("preserves sightlines, all wheelchair paths, population and gate capacities for every layout", () => {
    const base = reference(),
      g = buildGeometry(base),
      p = generatePopulation(g, base, 3001);
    for (const c of Object.values(interventionCandidates(base))) {
      const candidate = buildGeometry(c);
      expect(validateGeometry(candidate, c)).toEqual([]);
      expect(candidate.walls).toEqual(g.walls);
      expect(candidate.columns).toEqual(g.columns);
      expect(generatePopulation(candidate, c, 3001)).toEqual(p);
      for (const e of Object.values(g.links).filter(
        (e) => e.kind === "door" || e.kind === "stair",
      ))
        expect(gateCapacity(candidate.links[e.id], c)).toBe(
          gateCapacity(e, base),
        );
      for (const b of c.barriers) {
        const e = candidate.links[b.link];
        expect(e.kind).toBe("corridor");
        expect(e.width === 0 || e.width >= 1.1).toBe(true);
        expect(e.length).toBeGreaterThanOrEqual(g.links[b.link].length);
      }
    }
  });
  it.each([1022, 1023, 1033, 1041])(
    "clears former deadlock seed %i without changing the audience or service",
    (seed) => {
      const sim = new Simulation(reference(), seed);
      const r = sim.run();
      sim.assertInvariants();
      expect(r.outside).toBe(1329);
      expect(r.status).toBe("complete");
      expect(r.accessible.every((p) => p.exitTime !== null)).toBe(true);
      expect(r.clearance).toBeLessThan(900);
    },
    60000,
  );
});

describe("current-state guidance and route commitment", () => {
  const c = reference(),
    g = buildGeometry(c);
  function traveller() {
    const p = generatePopulation(g, c, 77)[0];
    p.link = "auditorium-door-1";
    p.dir = 1;
    p.node = g.links[p.link].a;
    p.state = "queuing";
    p.remaining = 0;
    p.destination = "west-portico";
    return p;
  }
  it("rejects a late detour from a nearby usable exit", () => {
    const p = traveller();
    expect(guidanceSwitchAllowed(g, c, p, "foyer", g.nodes.c1, new Map())).toBe(
      false,
    );
    expect(
      guidanceSwitchAllowed(g, c, p, "west-portico", g.nodes.c1, new Map()),
    ).toBe(true);
    p.link = "portico-door-1";
    p.remaining = 0.05;
    expect(guidanceSwitchAllowed(g, c, p, "foyer", g.nodes.c1, new Map())).toBe(
      false,
    );
  });
  it("permits meaningful improvement and known-blockage response", () => {
    const p = traveller();
    p.destination = "foyer";
    expect(
      guidanceSwitchAllowed(g, c, p, "west-portico", g.nodes.c1, new Map()),
    ).toBe(true);
    p.destination = "west-portico";
    for (const e of Object.values(g.links))
      if (
        e.id.startsWith("portico-door-") &&
        g.nodes[e.b].exit === "west-portico"
      )
        p.blocked.add(e.id);
    expect(guidanceSwitchAllowed(g, c, p, "foyer", g.nodes.c1, new Map())).toBe(
      true,
    );
  });
  it("does not react to an unseen remote queue or redraw preferences", () => {
    const p = traveller(),
      taste = structuredClone(p.taste);
    for (let i = 0; i < 10; i++)
      expect(
        guidanceSwitchAllowed(
          g,
          c,
          p,
          "foyer",
          g.nodes.c1,
          new Map([["east-balcony-door", 10000]]),
        ),
      ).toBe(false);
    expect(p.taste).toEqual(taste);
  });
});
