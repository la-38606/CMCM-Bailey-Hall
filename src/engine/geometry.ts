import { GEOMETRY_VERSION } from "./config";
import type { Config, Geometry, Link, Node, Point, Row } from "./types";
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export function polyLength(p: Point[]) {
  return p.slice(1).reduce((s, v, i) => s + distance(p[i], v), 0);
}
export function lanes(width: number) {
  return width > 0 ? Math.max(1, Math.floor((width + 1e-9) / 0.6)) : 0;
}
export function dimensions(e: Link) {
  e.plan = polyLength(e.points);
  e.length = Math.hypot(e.plan, e.drop);
  e.lanes = e.designedLanes ?? lanes(e.width);
  e.storage =
    e.kind === "row"
      ? Math.max(1, Math.floor(e.plan / 0.44))
      : Math.max(e.lanes, Math.floor(4.5 * e.plan * e.width));
  e.accessible = e.drop === 0 && e.width >= 0.9 && e.kind !== "stair";
}
// Piecewise traced horseshoe: straight side blocks, curved rear, and rectangular foyer.
// Coordinates inferred against the 20–22 inch seats and labelled row lengths, NOT a survey.
export const outline: [number, number][] = [
  [-16, 1],
  [-16, 6],
  [-16, 11],
  [-15, 16],
  [-12, 21],
  [-6.5, 24],
  [0, 25],
  [6.5, 24],
  [12, 21],
  [15, 16],
  [16, 11],
  [16, 6],
  [16, 1],
];
const inward = ([x, y]: [number, number], d: number): [number, number] => {
  const r = Math.hypot(x, y - 5);
  return [x * (1 - d / r), 5 + (y - 5) * (1 - d / r)];
};
export function buildGeometry(config: Config): Geometry {
  const g: Geometry = {
    version: GEOMETRY_VERSION,
    nodes: {},
    links: {},
    rows: [],
    walls: [],
    columns: [],
    adjacency: {},
  };
  const node = (
    id: string,
    x: number,
    y: number,
    floor = 0,
    zone = "auditorium",
    extra: Partial<Node> = {},
  ) => {
    g.nodes[id] = { id, x, y, floor, zone, ...extra };
    return id;
  };
  const link = (
    id: string,
    a: string,
    b: string,
    width: number,
    kind: Link["kind"] = "aisle",
    extra: Partial<Link> = {},
  ) => {
    const e: Link = {
      id,
      a,
      b,
      points: [g.nodes[a], g.nodes[b]],
      kind,
      width,
      plan: 0,
      length: 0,
      drop: 0,
      lanes: 0,
      storage: 0,
      accessible: true,
      directions: "both",
      closed: false,
      barrierSlot: kind === "corridor",
      provenance:
        "Problem statement pp. 4–7; topology traced; metric dimensions inferred from seating scale.",
      confidence: "inferred",
      ...extra,
    };
    dimensions(e);
    g.links[id] = e;
    return id;
  };
  const row = (
    id: string,
    section: Row["section"],
    a: string,
    b: string,
    count: number,
    wheelchair = false,
  ) => {
    const p = g.nodes[a],
      q = g.nodes[b];
    node(id, (p.x + q.x) / 2, (p.y + q.y) / 2, p.floor, p.zone);
    const links: [string, string] = [`${id}-left`, `${id}-right`];
    link(links[0], id, a, wheelchair ? 1.1 : 0.65, "row", {
      row: id,
      directions: "forward",
    });
    link(links[1], id, b, wheelchair ? 1.1 : 0.65, "row", {
      row: id,
      directions: "forward",
    });
    g.rows.push({
      id,
      section,
      count,
      origin: id,
      ends: [a, b],
      links,
      wheelchair,
    });
  };
  for (let i = 0; i < 13; i++) {
    const [x, y] = outline[i];
    node(`m${i}`, x, y);
    node(`c${i}`, x * 1.15, y + 1.8, 0, "corridor");
    node(`b${i}`, x, y, 1, "balcony");
    for (const prefix of ["m", "b"]) {
      const n = prefix === "m" ? 5 : 3;
      for (let r = 0; r < n; r++) {
        const [rx, ry] = inward(outline[i], 0.6 + (n - 1 - r) * 0.6);
        node(
          `${prefix}r${i}-${r}`,
          rx,
          ry,
          prefix === "b" ? 1 : 0,
          prefix === "b" ? "balcony" : "auditorium",
        );
        if (r)
          link(
            `${prefix}-radial-${i}-${r}`,
            `${prefix}r${i}-${r - 1}`,
            `${prefix}r${i}-${r}`,
            1.2,
            prefix === "b" ? "stair" : "aisle",
            prefix === "b" ? { drop: 0.18 } : {},
          );
      }
      link(
        `${prefix}-radial-${i}-out`,
        `${prefix}r${i}-${n - 1}`,
        `${prefix}${i}`,
        1.2,
      );
    }
    if (i) {
      link(`mezzanine-${i - 1}`, `m${i - 1}`, `m${i}`, 1.2);
      link(`corridor-${i - 1}`, `c${i - 1}`, `c${i}`, 2.4, "corridor");
      link(`balcony-${i - 1}`, `b${i - 1}`, `b${i}`, 1.8, "corridor");
    }
  }
  // Allocate the specified section totals to plan-defined row blocks, rather than adding people.
  const allocate = (total: number, weights: number[]) => {
    const sum = weights.reduce((a, b) => a + b, 0),
      v = weights.map((w) => Math.floor((total * w) / sum));
    for (let i = 0; v.reduce((a, b) => a + b, 0) < total; i++)
      v[i % v.length]++;
    return v;
  };
  const weights = outline
    .slice(1)
    .map((_, i) => distance(g.nodes[`m${i}`], g.nodes[`m${i + 1}`]));
  for (const [prefix, section, total, n] of [
    ["m", "mezzanine", 483, 5],
    ["b", "balcony", 316, 3],
  ] as const) {
    const counts = allocate(
      total,
      Array.from({ length: 12 * n }, (_, i) => weights[Math.floor(i / n)]),
    );
    for (let i = 0; i < 12; i++)
      for (let r = 0; r < n; r++)
        row(
          `${section}-${i}-${r}`,
          section,
          `${prefix}r${i}-${r}`,
          `${prefix}r${i + 1}-${r}`,
          counts[i * n + r],
        );
  }
  // Three accessible places occupy the raised level at rear aisles (the brief omits them from chair diagrams).
  for (const [i, station] of [4, 6, 8].entries()) {
    node(
      `wc-end-${i}`,
      g.nodes[`m${station}`].x + 0.8,
      g.nodes[`m${station}`].y,
      0,
    );
    link(`wc-access-${i}`, `wc-end-${i}`, `m${station}`, 1.1);
    row(`wheelchair-${i}`, "mezzanine", `m${station}`, `wc-end-${i}`, 1, true);
  }
  const central = Array(19).fill(17) as number[],
    wing = allocate(102, Array(19).fill(1));
  for (let j = 0; j < 19; j++) {
    const y = 3 + j * 0.86 + (j >= 10 ? 1.2 : 0);
    const inner = 4.8 + (j > 12 ? (j - 12) * 0.05 : 0);
    const outer = 11.8 - (j > 10 ? (j - 10) * 0.32 : 0);
    for (const [s, sign] of [
      ["L", -1],
      ["R", 1],
    ] as const) {
      node(`o${s}${j}`, sign * inner, y);
      node(`w${s}${j}`, sign * outer, y + 0.2);
      if (j) {
        link(`inner-${s}-${j}`, `o${s}${j - 1}`, `o${s}${j}`, 1.2);
        link(`curved-${s}-${j}`, `w${s}${j - 1}`, `w${s}${j}`, 1.2);
      }
      row(
        `orchestra-${s}-${j}`,
        "orchestra",
        `o${s}${j}`,
        `w${s}${j}`,
        wing[j],
      );
    }
    row(`orchestra-center-${j}`, "orchestra", `oL${j}`, `oR${j}`, central[j]);
  }
  // Cross-aisle interrupts the outer blocks at the middle break; no central row shortcut.
  for (const [s, sign] of [
    ["L", -1],
    ["R", 1],
  ] as const) {
    node(`cross-${s}`, sign * 12.7, 11.75);
    node(`cross-end-${s}`, sign * 13.4, 11.75);
    node(`cross-curve-${s}`, sign * 11.8, 11.75);
    node(`cross-step-end-${s}`, sign * 10.6, 11.75);
    node(`cross-inner-${s}`, sign * 4.8, 11.75);
    delete g.links[`curved-${s}-10`];
    delete g.links[`inner-${s}-10`];
    link(`curved-${s}-10a`, `w${s}9`, `cross-curve-${s}`, 1.2);
    link(`curved-${s}-10b`, `cross-curve-${s}`, `w${s}10`, 1.2);
    link(`inner-${s}-10a`, `o${s}9`, `cross-inner-${s}`, 1.2);
    link(`inner-${s}-10b`, `cross-inner-${s}`, `o${s}10`, 1.2);
    link(
      `cross-outer-${s}`,
      `cross-end-${s}`,
      `cross-${s}`,
      1.2,
      "cross-aisle",
    );
    link(
      `cross-curve-${s}`,
      `cross-${s}`,
      `cross-curve-${s}`,
      1.2,
      "cross-aisle",
    );
    link(
      `cross-step-${s}`,
      `cross-curve-${s}`,
      `cross-step-end-${s}`,
      1.2,
      "stair",
      {
        drop: 0.54,
        provenance:
          "cross_aisle_01/03; short 1.2 m plan run, three 0.18 m risers, 1.2 m clear width inferred.",
      },
    );
    link(
      `cross-inner-${s}`,
      `cross-step-end-${s}`,
      `cross-inner-${s}`,
      1.2,
      "cross-aisle",
    );
  }

  // Six orchestra-to-mezzanine accesses; cross-aisles meet two of them.
  for (const [s, stations] of [
    ["L", [0, 2, 5]],
    ["R", [12, 10, 7]],
  ] as const) {
    link(`access-${s}-front`, `w${s}0`, `mr${stations[0]}-0`, 1.2, "stair", {
      drop: 0.72,
    });
    link(
      `access-${s}-middle`,
      `cross-end-${s}`,
      `mr${stations[1]}-0`,
      1.2,
      "stair",
      { drop: 0.54 },
    );
    link(`access-${s}-rear`, `o${s}18`, `mr${stations[2]}-0`, 1.2, "stair", {
      drop: 0.72,
    });
  }
  const doors = [0, 1, 3, 4, 6, 8, 9, 11, 12];
  for (const i of doors)
    link(`auditorium-door-${i}`, `m${i}`, `c${i}`, 1.4, "door");
  for (let i = 0; i < 12; i++) {
    const a = g.nodes[`m${i}`],
      b = g.nodes[`m${i + 1}`];
    const len = distance(a, b),
      gapA = doors.includes(i) ? 1 / len : 0,
      gapB = doors.includes(i + 1) ? 1 / len : 0;
    const p = (t: number): Point => ({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t + 0.3,
      floor: 0,
    });
    g.walls.push({
      a: p(gapA),
      b: p(1 - gapB),
      source: "Auditorium perimeter wall, plan p.4",
    });
    const ba = g.nodes[`b${i}`];
    g.columns.push({ x: ba.x * 0.97, y: ba.y * 0.97, floor: 1, radius: 0.35 });
  }
  for (const [s, sign, stations] of [
    ["west", -1, [1, 3]],
    ["east", 1, [9, 11]],
  ] as const) {
    node(`${s}-portico`, sign * 21, 13, 0, "outside", { exit: `${s}-portico` });
    for (const i of stations) {
      node(`portico-${i}`, sign * 20, g.nodes[`c${i}`].y, 0, "outside", {
        exit: `${s}-portico`,
      });
      link(`portico-door-${i}`, `c${i}`, `portico-${i}`, 1.4, "door", {
        directions: "forward",
      });
    }
    node(`${s}-stage-landing`, sign * 18, -1, 0, "outside", {
      exit: `${s}-stage`,
    });
    node(`${s}-stage-bend`, sign * 13, -1, 0, "stage-route");
    const side = s === "west" ? "L" : "R";
    link(`${s}-stage-approach`, `o${side}0`, `${s}-stage-bend`, 1.2, "stair", {
      drop: 0.9,
    });
    link(
      `${s}-stage-door`,
      `${s}-stage-bend`,
      `${s}-stage-landing`,
      1.2,
      "door",
      { directions: "forward" },
    );
    const idx = s === "west" ? 0 : 12;
    node(`${s}-balcony-turn`, sign * 18, 0, 1, "escape-stair");
    node(`${s}-balcony-landing`, sign * 19, -3, 0, "outside", {
      exit: s === "west" ? "northwest-balcony" : "northeast-balcony",
    });
    link(`${s}-balcony-door`, `b${idx}`, `${s}-balcony-turn`, 1.2, "door");
    link(
      `${s}-balcony-descent`,
      `${s}-balcony-turn`,
      `${s}-balcony-landing`,
      1.2,
      "stair",
      { drop: 4.2, directions: "forward" },
    );
    const rear = s === "west" ? 4 : 8;
    node(`${s}-stair-top`, sign * 9, 25, 1, "foyer-stair");
    node(`${s}-stair-half`, sign * 10, 27, 1, "foyer-stair");
    node(`${s}-stair-bottom`, sign * 8, 28, 0, "corridor");
    link(`${s}-balcony-rear`, `b${rear}`, `${s}-stair-top`, 1.8, "door");
    link(
      `${s}-stair-upper`,
      `${s}-stair-top`,
      `${s}-stair-half`,
      1.8,
      "stair",
      { drop: 2.1, designedLanes: 2 },
    );
    link(
      `${s}-stair-lower`,
      `${s}-stair-half`,
      `${s}-stair-bottom`,
      1.8,
      "stair",
      { drop: 2.1, designedLanes: 2 },
    );
    link(
      `${s}-stair-corridor`,
      `${s}-stair-bottom`,
      `c${s === "west" ? 5 : 7}`,
      1.8,
      "corridor",
    );
  }
  for (let i = 0; i < 3; i++) {
    node(`foyer-in-${i}`, (i - 1) * 4, 29, 0, "foyer");
    link(`foyer-door-${i}`, `c${i + 5}`, `foyer-in-${i}`, 1.8, "door");
    if (i)
      link(
        `foyer-cross-${i}`,
        `foyer-in-${i - 1}`,
        `foyer-in-${i}`,
        3,
        "corridor",
      );
  }
  for (let i = 0; i < 5; i++) {
    node(`foyer-doorway-${i}`, (i - 2) * 2.3, 32, 0, "foyer");
    node(`foyer-exterior-${i}`, (i - 2) * 2.3, 33, 0, "outside", {
      exit: "foyer",
    });
    link(
      `foyer-approach-${i}`,
      `foyer-in-${Math.min(2, Math.floor(i / 2))}`,
      `foyer-doorway-${i}`,
      2.4,
      "corridor",
    );
    link(
      `foyer-exit-${i}`,
      `foyer-doorway-${i}`,
      `foyer-exterior-${i}`,
      1.5,
      "door",
      { directions: "forward" },
    );
  }
  // The foyer wall has three explicit openings; no acoustic view through its solid sections.
  for (const [a, b] of [
    [-10, -5],
    [-3, -1],
    [1, 3],
    [5, 10],
  ])
    g.walls.push({
      a: { x: a, y: 28.4, floor: 0 },
      b: { x: b, y: 28.4, floor: 0 },
      source: "Foyer partition, plan p.4",
    });
  for (const [id, d] of Object.entries(config.dimensions)) {
    const e = g.links[id];
    if (!e) throw new Error(`Unknown dimension link ${id}`);
    if (d.width !== undefined) e.width = d.width;
    if (d.drop !== undefined) e.drop = d.drop;
    dimensions(e);
  }
  for (const id of config.closures) {
    if (!g.links[id]) throw new Error(`Unknown closure ${id}`);
    g.links[id].closed = true;
  }
  for (const barrier of config.barriers) {
    const e = g.links[barrier.link];
    if (!e?.barrierSlot) throw new Error(`No barrier slot on ${barrier.link}`);
    if (
      !Number.isFinite(barrier.length) ||
      barrier.length < 0 ||
      !Number.isFinite(barrier.angle)
    )
      throw new Error("Invalid barrier dimensions");
    const span = Math.abs(
      barrier.length * Math.sin((barrier.angle * Math.PI) / 180),
    );
    e.width = Math.max(0, e.width - span);
    if (e.width > 0 && e.width < 1.1)
      throw new Error(
        `Barrier ${e.id}: partial bypass below 1.1 m screening rule`,
      );
    const a = e.points[0],
      b = e.points.at(-1)!,
      dx = b.x - a.x,
      dy = b.y - a.y,
      len = distance(a, b);
    e.points = [
      a,
      {
        x: (a.x + b.x) / 2 - ((dy / len) * span) / 2,
        y: (a.y + b.y) / 2 + ((dx / len) * span) / 2,
        floor: a.floor,
      },
      b,
    ];
    e.directions = barrier.direction;
    e.closed ||= e.width === 0;
    dimensions(e);
    e.provenance += " Low transparent belt; physical polyline detour.";
  }
  for (const e of Object.values(g.links)) {
    const family = e.id.match(
      /^(inner-[LR]|curved-[LR]|mezzanine|corridor|balcony)-/,
    );
    const radial = e.id.match(/^([mb]-radial-\d+)-/);
    if (e.kind !== "row" && (family || radial))
      e.laneFamily = (family?.[1] ?? radial![1]) + `:${e.lanes}`;
  }
  for (const n of Object.keys(g.nodes)) g.adjacency[n] = [];
  for (const e of Object.values(g.links)) {
    g.adjacency[e.a].push({ link: e.id, to: e.b, dir: 1 });
    if (e.directions === "both")
      g.adjacency[e.b].push({ link: e.id, to: e.a, dir: -1 });
  }
  return g;
}
export function reachable(g: Geometry, start: string, wheelchair = false) {
  const found = new Set([start]),
    stack = [start];
  while (stack.length) {
    const n = stack.pop()!;
    for (const a of g.adjacency[n]) {
      const e = g.links[a.link];
      if (
        e.closed ||
        e.kind === "row" ||
        (wheelchair && !e.accessible) ||
        found.has(a.to)
      )
        continue;
      found.add(a.to);
      stack.push(a.to);
    }
  }
  return found;
}
export function validateGeometry(g: Geometry, c: Config): string[] {
  const errors: string[] = [];
  for (const e of Object.values(g.links)) {
    if (
      !Number.isFinite(e.width) ||
      e.width < 0 ||
      !Number.isFinite(e.drop) ||
      e.drop < 0 ||
      e.length <= 0 ||
      !Number.isFinite(e.length)
    )
      errors.push(`Invalid dimensions: ${e.id}`);
    if (e.lanes < 1 && !e.closed)
      errors.push(`Untraversable open link: ${e.id}`);
  }
  for (const r of g.rows) {
    if (
      !r.ends.some((n) =>
        [...reachable(g, n, r.wheelchair)].some((id) => g.nodes[id].exit),
      )
    )
      errors.push(`No feasible exterior route: ${r.id}`);
  }
  for (const m of c.managers) {
    if (!g.nodes[m.node]) errors.push(`Unknown manager post: ${m.node}`);
    if (m.patrol) {
      let from = m.node;
      for (const to of [...m.patrol, m.node]) {
        const e = g.adjacency[from]?.find((a) => a.to === to);
        if (
          !e ||
          !["aisle", "corridor", "cross-aisle"].includes(
            g.links[e.link].kind,
          ) ||
          g.links[e.link].width < 1.8 ||
          g.links[e.link].drop > 0
        )
          errors.push(`Invalid mobile manager leg ${from} → ${to}`);
        from = to;
      }
    }
  }
  for (const s of c.signs) {
    if (
      !g.nodes[s.node] ||
      (s.kind === "strip" && (!s.link || !g.links[s.link]))
    )
      errors.push(`Invalid sign location ${s.id}`);
    if (
      [s.range, s.activation, s.detection, s.acceptance, s.halfAngle].some(
        (v) => !Number.isFinite(v),
      ) ||
      s.range <= 0 ||
      s.activation < 0 ||
      s.detection < 0 ||
      s.detection > 1 ||
      s.acceptance < 0 ||
      s.acceptance > 1
    )
      errors.push(`Invalid sign parameters ${s.id}`);
  }
  return errors;
}
export function pointOnLink(e: Link, fraction: number): Point {
  if (fraction >= 1) return e.points.at(-1)!;
  if (fraction <= 0) return e.points[0];
  let d = Math.max(0, Math.min(1, fraction)) * e.plan;
  for (let i = 1; i < e.points.length; i++) {
    const a = e.points[i - 1],
      b = e.points[i],
      len = distance(a, b);
    if (d <= len)
      return {
        x: a.x + ((b.x - a.x) * d) / len,
        y: a.y + ((b.y - a.y) * d) / len,
        floor: a.floor,
      };
    d -= len;
  }
  return e.points.at(-1)!;
}
