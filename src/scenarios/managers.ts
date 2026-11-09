import type { Config } from "../engine/types";
import current from "../../scenarios/managers/current-nearest.json";
import all from "../../scenarios/managers/nearest-all.json";
import coordinated from "../../scenarios/managers/coordinated.json";
import balcony from "../../scenarios/managers/nearest-foyer-balcony.json";

// Load the exact evaluated configurations, including the common final-occupant rule.
export const managerPolicyScenarios: Record<string, Config> = {
  "manager-current-nearest": current as Config,
  "manager-nearest-all": all as Config,
  "manager-coordinated": coordinated as Config,
  "manager-nearest-foyer-balcony": balcony as Config,
};
