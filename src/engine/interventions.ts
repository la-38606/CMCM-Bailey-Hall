import type { Config, Exit, ManagerConfig, SignConfig } from "./types";

// Public, fixed spatial assignments: never individualized or supplied remote queues.
export function studyLEDs(dynamic = false): SignConfig[] {
  const strips: [string, string, Exit][] = [
    ["m1", "mezzanine-1", "west-portico"],
    ["m3", "mezzanine-3", "foyer"],
    ["m5", "mezzanine-5", "foyer"],
    ["m7", "mezzanine-7", "foyer"],
    ["m9", "mezzanine-9", "foyer"],
    ["m11", "mezzanine-11", "east-portico"],
    ["b1", "balcony-1", "northwest-balcony"],
    ["b4", "balcony-4", "foyer"],
    ["b7", "balcony-7", "foyer"],
    ["b10", "balcony-10", "northeast-balcony"],
    ["c1", "corridor-1", "west-portico"],
    ["c4", "corridor-4", "foyer"],
    ["c7", "corridor-7", "foyer"],
    ["c10", "corridor-10", "east-portico"],
    ["oL0", "inner-L-1", "west-stage"],
    ["oR0", "inner-R-1", "east-stage"],
  ];
  return strips.map(([node, link, exit], i) => ({
    id: `ZLED${i + 1}`,
    node,
    link,
    exit,
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
export function coordinatedManagers(base: Config, count = 6): ManagerConfig[] {
  const managers = base.managers.map((m) => ({
    ...m,
    exit: (["CM2", "CM3", "CM5", "CM6"].includes(m.id)
      ? "foyer"
      : m.exit) as Exit,
  }));
  if (count >= 8)
    managers.push(
      { id: "CM7", node: "oL0", exit: "west-stage" },
      { id: "CM8", node: "oR0", exit: "east-stage" },
    );
  if (count >= 10)
    managers.push(
      { id: "CM9", node: "m6", exit: "foyer" },
      { id: "CM10", node: "b6", exit: "foyer" },
    );
  return managers;
}
export function interventionCandidates(base: Config): Record<string, Config> {
  const belts: Config["barriers"] = [3, 8].map((n) => ({
    link: `corridor-${n}`,
    length: 2.4,
    angle: 90,
    direction: "both",
  }));
  const partial: Config["barriers"] = [3, 8].map((n) => ({
    link: `corridor-${n}`,
    length: 1,
    angle: 30,
    direction: "both",
  }));
  const six = { ...base, managers: coordinatedManagers(base) };
  const eight = { ...base, managers: coordinatedManagers(base, 8) };
  return {
    baseline: { ...base, name: "Corrected six-manager reference" },
    coordinated: { ...six, name: "Coordinated six-manager assignments" },
    "barriers-only": {
      ...six,
      name: "Six managers + open corridor partitions",
      barriers: belts,
    },
    "partial-barriers": {
      ...six,
      name: "Six managers + partial open belts",
      barriers: partial,
    },
    "led-only": {
      ...six,
      name: "Six managers + zoned LED guidance",
      signs: studyLEDs(),
    },
    combined: {
      ...six,
      name: "Six managers + zoned LEDs + open partitions",
      barriers: belts,
      signs: studyLEDs(),
    },
    "combined-partial": {
      ...six,
      name: "Six managers + zoned LEDs + partial belts",
      barriers: partial,
      signs: studyLEDs(),
    },
    "dynamic-only": {
      ...six,
      name: "Six managers + dynamic zoned LEDs",
      signs: studyLEDs(true),
    },
    "dynamic-partial": {
      ...six,
      name: "Six managers + dynamic LEDs + partial belts",
      barriers: partial,
      signs: studyLEDs(true),
    },
    "dynamic-combined": {
      ...six,
      name: "Six managers + dynamic LEDs + open partitions",
      barriers: belts,
      signs: studyLEDs(true),
    },
    "eight-managers": { ...eight, name: "Eight coordinated managers" },
    "eight-combined": {
      ...eight,
      name: "Eight managers + zoned LEDs + open partitions",
      barriers: belts,
      signs: studyLEDs(),
    },
    "ten-combined": {
      ...base,
      name: "Ten managers + zoned LEDs + open partitions",
      managers: coordinatedManagers(base, 10),
      barriers: belts,
      signs: studyLEDs(),
    },
  };
}
