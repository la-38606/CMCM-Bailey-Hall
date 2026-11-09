import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { reference, scenarios, validateConfig } from "../src/engine/config";
import { buildGeometry, validateGeometry } from "../src/engine/geometry";
import { interventionCandidates } from "../src/engine/interventions";
import { generatePopulation } from "../src/engine/population";
import { managerPolicyScenarios } from "../src/scenarios/managers";
import { audienceComparisons } from "../src/scenarios/audience";
import { reviewLayout } from "../src/review/layout";
import type { Config } from "../src/engine/types";

describe("scenario validation reviewed against external JSON", () => {
  it.each([
    null,
    [],
    {},
    { ...reference(), signs: null },
    { ...reference(), dimensions: null },
  ])("rejects malformed roots or collections without a crash (%#)", (value) => {
    expect(validateConfig(value as unknown as Config).length).toBeGreaterThan(
      0,
    );
  });
  it("rejects duplicate ids, unknown exits and reserved existing-sign ids", () => {
    const c = interventionCandidates(reference())["dynamic-only"];
    c.signs[1].id = c.signs[0].id;
    c.managers[1].exit = "invented" as never;
    c.signs[2].id = "EXIT-auditorium-door-1";
    expect(validateConfig(c).join(" ")).toMatch(/Duplicate/);
    expect(validateConfig(c).join(" ")).toMatch(/Invalid managers/);
    expect(validateConfig(c).join(" ")).toMatch(/reserved/);
  });
  it("rejects unrecognized barrier directions and duplicated slots", () => {
    const c = interventionCandidates(reference())["dynamic-partial"];
    c.barriers[0].direction = "backward" as never;
    expect(validateConfig(c).join(" ")).toMatch(/direction/);
    c.barriers[0].direction = "both";
    c.barriers.push({ ...c.barriers[0] });
    expect(validateConfig(c).join(" ")).toMatch(/Duplicate barrier/);
  });
  it.each([{ facing: [0, 0] }, { facing: [NaN, 1] }, { facing: [1] }])(
    "rejects malformed wall-facing vectors (%#)",
    ({ facing }) => {
      const c = interventionCandidates(reference())["dynamic-only"];
      c.signs[0].kind = "wall";
      c.signs[0].facing = facing as [number, number];
      expect(validateConfig(c).join(" ")).toMatch(/orientation/);
    },
  );
  it("rejects strip controllers located away from the installed walkway", () => {
    const c = interventionCandidates(reference())["dynamic-only"];
    c.signs[0].node = "b8";
    expect(validateGeometry(buildGeometry(c), c).join(" ")).toMatch(/endpoint/);
  });
  it("accepts all retained standard and experimental scenarios", () => {
    for (const c of Object.values({
      ...scenarios(),
      ...interventionCandidates(reference()),
      ...audienceComparisons(reference()),
      ...managerPolicyScenarios,
    })) {
      expect(validateConfig(c), c.name).toEqual([]);
      expect(validateGeometry(buildGeometry(c), c), c.name).toEqual([]);
    }
  });
});
describe("physical feasibility is not graph connectivity", () => {
  it("flags both study belts and their adjacent door junctions", () => {
    const c = interventionCandidates(reference())["dynamic-partial"],
      findings = reviewLayout(buildGeometry(c), c);
    const belts = findings.filter((f) => f.status === "not-recommended");
    expect(belts).toHaveLength(2);
    expect(belts.every((f) => f.reason.includes("auditorium-door"))).toBe(true);
    expect(findings.some((f) => f.device === "LED system")).toBe(true);
    expect(
      findings.filter((f) => f.reason.includes("Stage-side")),
    ).toHaveLength(2);
  });
  it("keeps physical review advisory and leaves configurations unchanged", () => {
    const c = interventionCandidates(reference())["dynamic-combined"],
      before = structuredClone(c);
    expect(
      reviewLayout(buildGeometry(c), c).some((f) =>
        f.reason.includes("Closes"),
      ),
    ).toBe(true);
    expect(c).toEqual(before);
  });
});
describe("knowledge and entrance preference are separate", () => {
  it("varies known exits without altering age, speed, response, groups or tastes", () => {
    const cs = audienceComparisons(reference()),
      a = cs["information-full"],
      b = cs["information-limited"];
    const pa = generatePopulation(buildGeometry(a), a, 7301),
      pb = generatePopulation(buildGeometry(b), b, 7301);
    const traits = (ps: typeof pa) => ps.map(({ known, ...p }) => p);
    expect(traits(pa)).toEqual(traits(pb));
    expect(
      pb.every(
        (p, i) =>
          p.known.includes("foyer") &&
          p.known.every((e) => pa[i].known.includes(e)),
      ),
    ).toBe(true);
    expect(pb.some((p, i) => p.known.length < pa[i].known.length)).toBe(true);
  });
  it("can remove foyer preference without giving extra exit knowledge", () => {
    const cs = audienceComparisons(reference()),
      a = cs["information-full"],
      b = cs["information-no-bias"];
    const pa = generatePopulation(buildGeometry(a), a, 7301),
      pb = generatePopulation(buildGeometry(b), b, 7301);
    expect(pb.every((p) => p.familiarity === 0)).toBe(true);
    expect(pa.some((p) => p.familiarity === 12)).toBe(true);
    expect(pa.map((p) => p.known)).toEqual(pb.map((p) => p.known));
  });
});

it("refuses to overwrite an existing experiment directory before starting workers", () => {
  const dir = mkdtempSync(join(tmpdir(), "bailey-evidence-"));
  try {
    const sentinel = join(dir, "experiments.json");
    writeFileSync(sentinel, "preserve existing evidence");
    expect(() =>
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/experiments.ts",
          "--out-dir",
          dir,
          "--runs",
          "1",
        ],
        { stdio: "pipe" },
      ),
    ).toThrow();
    expect(readFileSync(sentinel, "utf8")).toBe("preserve existing evidence");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
