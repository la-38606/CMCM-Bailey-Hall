import type { Config, Exit, ManagerConfig, SignConfig } from "./types";
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
