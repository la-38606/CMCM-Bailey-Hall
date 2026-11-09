import type { Config, Geometry } from "../engine/types";
export type LayoutFinding = {
  device: string;
  status: "not-recommended" | "site-review";
  reason: string;
};

// Engineering interpretation only: never alters routing, capacity or the experiment.
export function reviewLayout(g: Geometry, c: Config): LayoutFinding[] {
  const findings: LayoutFinding[] = [];
  for (const b of c.barriers) {
    const e = g.links[b.link];
    if (!e) continue;
    const doors = Object.values(g.links)
      .filter(
        (d) =>
          d.kind === "door" && [e.a, e.b].some((n) => n === d.a || n === d.b),
      )
      .map((d) => d.id);
    findings.push({
      device: b.link,
      status: "not-recommended",
      reason: `${e.closed ? "Closes a circulation connection" : `Narrows circulation to ${e.width.toFixed(2)} m`}.
      ${doors.length ? `Shares a junction with ${doors.join(", ")}.` : ""}
      Sightline preservation and graph connectivity do not establish safe egress. Cornell EHS requires clear exit routes; posts, door swings, cane detection and crowd contact are not modelled.`,
    });
  }
  if (c.signs.length)
    findings.push({
      device: "LED system",
      status: "site-review",
      reason:
        "Concept only. Verify local arrows at every turn, continuity to exterior exits, mounting and emergency power. The model communicates exit names and does not test human arrow comprehension, crowd occlusion or hardware failure. Dynamic messages can conflict with staff; software priority is not real-world message coordination.",
    });
  for (const s of c.signs.filter(
    (s) => s.exit === "west-stage" || s.exit === "east-stage",
  ))
    findings.push({
      device: s.id,
      status: "site-review",
      reason:
        "Stage-side route: verify the complete public escape path, door operation and stage-use restrictions on site before adding an arrow. A schematic exit node is insufficient.",
    });
  return findings;
}
