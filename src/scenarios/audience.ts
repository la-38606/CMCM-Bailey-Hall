import type { Config } from "../engine/types";

// Controlled information comparisons, not calibrated demographic categories.
// Keep speed, age, response, groups and compliance identical across these arms.
export function audienceComparisons(base: Config): Record<string, Config> {
  const common = { ...base, managers: [], signs: [], barriers: [] };
  return {
    "information-full": {
      ...common,
      name: "Information study · all eligible exits known",
      knowledge: 1,
      familiarityShare: 0.35,
    },
    "information-limited": {
      ...common,
      name: "Information study · limited exit knowledge (assumed 50%)",
      knowledge: 0.5,
      familiarityShare: 0.35,
    },
    "information-no-bias": {
      ...common,
      name: "Information study · known exits, no foyer bias",
      knowledge: 1,
      familiarityShare: 0,
    },
  };
}
