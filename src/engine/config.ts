import { interventionCandidates } from "./interventions";
import {
  EXITS,
  type Config,
  type Exit,
  type ManagerConfig,
  type SignConfig,
} from "./types";
export const GEOMETRY_VERSION = "bailey-traced-1";
export function managers(count = 6, alternate = false): ManagerConfig[] {
  const posts = alternate
    ? [
        "c1",
        "c3",
        "c9",
        "c11",
        "b4",
        "b8",
        "m4",
        "m8",
        "oL9",
        "oR9",
        "c5",
        "c7",
      ]
    : [
        "m1",
        "m4",
        "m8",
        "m11",
        "b4",
        "b8",
        "c1",
        "c11",
        "oL9",
        "oR9",
        "c5",
        "c7",
      ];
  return Array.from({ length: count }, (_, i) => {
    const node = posts[i % posts.length],
      west = node.includes("L") || Number(node.slice(1)) < 6;
    return {
      id: `CM${i + 1}`,
      node,
      exit: (node.startsWith("b")
        ? west
          ? "northwest-balcony"
          : "northeast-balcony"
        : west
          ? "west-portico"
          : "east-portico") as Exit,
    };
  });
}

export function leds(dynamic = false): SignConfig[] {
  return [1, 4, 8, 11].map((n, i) => ({
    id: `LED${i + 1}`,
    node: `c${n}`,
    link: `corridor-${n}`,
    exit: (i < 2 ? "west-portico" : "east-portico") as Exit,
    kind: "strip",
    dynamic,
    existing: false,
    facing: [0, -1],
    activation: 3,
    range: 8,
    detection: 0.77,
    acceptance: 0.8,
    halfAngle: 70,
  }));
}
export function reference(): Config {
  return {
    version: 1,
    geometryVersion: GEOMETRY_VERSION,
    name: "Six-manager concert emergency",
    dt: 0.1,
    cutoff: 900,
    speedMean: 1.4,
    speedSD: 0.18,
    olderShare: 0.2,
    olderMultiplier: 0.85,
    stairRatio: 0.57,
    olderStairRatio: 0.51,
    recognitionMedian: 6,
    responseMedian: 14,
    logSD: 0.6,
    familiarityShare: 0.35,
    knowledge: 1,
    managerCompliance: 0.85,
    environment: 1,
    returnPolicy: "available-lane",
    announcement: false,
    managers: managers(),
    signs: [],
    barriers: [],
    closures: [],
    dimensions: {},
  };
}
export function scenarios(): Record<string, Config> {
  const base = reference();
  return {
    concert: { ...base, name: "Ordinary concert departure", managers: [] },
    emergency: base,
    "study-coordinated": interventionCandidates(base).coordinated,
    "study-led": interventionCandidates(base)["dynamic-only"],
    "study-barriers": interventionCandidates(base)["barriers-only"],
    "study-combined": interventionCandidates(base)["dynamic-combined"],
    "study-partial": interventionCandidates(base)["dynamic-partial"],
    "alternate-managers": {
      ...base,
      name: "Alternate manager posts",
      managers: managers(6, true),
    },
    "twelve-managers": {
      ...base,
      name: "Twelve-manager emergency",
      managers: managers(12),
    },
    lecture: {
      ...base,
      name: "Familiar student lecture",
      managers: [],
      olderShare: 0.1,
      familiarityShare: 0,
      recognitionMedian: 3,
      responseMedian: 8,
    },
    "blocked-exit": {
      ...base,
      name: "Unknown west portico closure",
      closures: ["portico-door-1", "portico-door-3"],
    },
    "static-led": { ...base, name: "Static LED strips", signs: leds() },
    "dynamic-led": { ...base, name: "Dynamic LED strips", signs: leds(true) },
    barriers: {
      ...base,
      name: "Transparent corridor belts",
      barriers: [
        { link: "corridor-4", length: 1.2, angle: 45, direction: "both" },
        { link: "corridor-7", length: 1.2, angle: 45, direction: "both" },
      ],
    },
    accessible: {
      ...base,
      name: "Accessible evacuation and assistance",
      announcement: true,
    },
    "slower-response": {
      ...base,
      name: "Slower recognition and response",
      recognitionMedian: 10,
      responseMedian: 30,
    },
    "low-compliance": {
      ...base,
      name: "Lower guidance compliance",
      managerCompliance: 0.7,
      signs: leds(true).map((s) => ({ ...s, acceptance: 0.6 })),
    },
    "older-audience": { ...base, name: "50% older audience", olderShare: 0.5 },
    "slower-walking": { ...base, name: "Slower free walking", speedMean: 1.3 },
    "strict-return-wait": {
      ...base,
      name: "Return-lane waiting sensitivity",
      returnPolicy: "wait-for-lane",
    },
    "reduced-knowledge": {
      ...base,
      name: "Reduced exit knowledge",
      knowledge: 0.5,
    },
  };
}
export function validateConfig(c: Config): string[] {
  const errors: string[] = [];
  if (!c || typeof c !== "object" || Array.isArray(c))
    return ["Scenario must be an object."];
  for (const key of ["managers", "signs", "barriers", "closures"] as const)
    if (!Array.isArray(c[key])) errors.push(`${key} must be an array.`);
  if (
    !c.dimensions ||
    typeof c.dimensions !== "object" ||
    Array.isArray(c.dimensions)
  )
    errors.push("dimensions must be an object.");
  if (errors.length) return errors;
  if (typeof c.name !== "string" || typeof c.announcement !== "boolean")
    errors.push("Scenario name and announcement have invalid types.");
  for (const key of ["managers", "signs"] as const) {
    const ids = new Set<string>();
    for (const item of c[key]) {
      if (
        !item ||
        typeof item !== "object" ||
        typeof item.id !== "string" ||
        !item.id ||
        typeof item.node !== "string" ||
        !EXITS.includes(item.exit)
      ) {
        errors.push(`Invalid ${key} installation.`);
        continue;
      }
      if (ids.has(item.id) || item.id.startsWith("EXIT-"))
        errors.push(`Duplicate or reserved installation id: ${item.id}`);
      ids.add(item.id);
    }
  }
  for (const m of c.managers)
    if (
      m &&
      m.patrol !== undefined &&
      (!Array.isArray(m.patrol) || m.patrol.some((n) => typeof n !== "string"))
    )
      errors.push("Manager patrol must contain junction names.");
  for (const s of c.signs)
    if (
      s &&
      (!["wall", "strip"].includes(s.kind) ||
        typeof s.dynamic !== "boolean" ||
        typeof s.existing !== "boolean" ||
        !Array.isArray(s.facing) ||
        s.facing.length !== 2 ||
        !s.facing.every(Number.isFinite) ||
        !Number.isFinite(s.halfAngle) ||
        s.halfAngle < 0 ||
        s.halfAngle > 180 ||
        (s.kind === "wall" && Math.hypot(...s.facing) === 0))
    )
      errors.push(`Invalid sign orientation or type: ${s.id}`);
  const barrierLinks = new Set<string>();
  for (const b of c.barriers) {
    if (
      !b ||
      typeof b.link !== "string" ||
      !["both", "forward"].includes(b.direction) ||
      !Number.isFinite(b.length) ||
      b.length < 0 ||
      !Number.isFinite(b.angle)
    ) {
      errors.push("Invalid barrier parameters or direction.");
      continue;
    }
    if (barrierLinks.has(b.link))
      errors.push(`Duplicate barrier slot: ${b.link}`);
    barrierLinks.add(b.link);
  }
  if (c.closures.some((id) => typeof id !== "string"))
    errors.push("Closure ids must be strings.");
  for (const [id, d] of Object.entries(c.dimensions))
    if (
      !d ||
      typeof d !== "object" ||
      Array.isArray(d) ||
      Object.entries(d).some(
        ([k, v]) =>
          !["width", "drop"].includes(k) || !Number.isFinite(v) || v < 0,
      )
    )
      errors.push(`Invalid dimension override: ${id}`);
  if (!["available-lane", "wait-for-lane"].includes(c.returnPolicy))
    errors.push("Unknown return-lane policy.");
  if (c.version !== 1 || c.geometryVersion !== GEOMETRY_VERSION)
    errors.push("Unsupported scenario or geometry version.");
  for (const k of [
    "dt",
    "cutoff",
    "speedMean",
    "recognitionMedian",
    "responseMedian",
    "environment",
  ] as const)
    if (!Number.isFinite(c[k]) || c[k] <= 0)
      errors.push(`${k} must be positive.`);
  if (Math.abs(c.cutoff / c.dt - Math.round(c.cutoff / c.dt)) > 1e-7)
    errors.push(
      "The observation horizon must contain an integer number of integration steps.",
    );
  if (c.dt > 1 || c.cutoff > 900)
    errors.push("dt must be ≤1 s and cutoff ≤900 s.");
  for (const k of [
    "olderShare",
    "familiarityShare",
    "knowledge",
    "managerCompliance",
  ] as const)
    if (c[k] < 0 || c[k] > 1 || !Number.isFinite(c[k]))
      errors.push(`${k} must be in [0,1].`);
  if (
    !Number.isFinite(c.speedSD) ||
    c.speedSD < 0 ||
    !Number.isFinite(c.logSD) ||
    c.logSD < 0
  )
    errors.push("Distribution spreads must be nonnegative.");
  for (const k of ["olderMultiplier", "stairRatio", "olderStairRatio"] as const)
    if (!Number.isFinite(c[k]) || c[k] <= 0)
      errors.push(`${k} must be positive.`);
  return errors;
}
