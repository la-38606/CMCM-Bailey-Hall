export const EXITS = [
  "foyer",
  "west-portico",
  "east-portico",
  "west-stage",
  "east-stage",
  "northwest-balcony",
  "northeast-balcony",
] as const;
export type Exit = (typeof EXITS)[number];
export type Point = { x: number; y: number; floor: number };
export type Node = Point & {
  id: string;
  zone: string;
  exit?: Exit;
  label?: string;
};
export type LinkKind =
  "aisle" | "cross-aisle" | "corridor" | "row" | "door" | "stair";
export type Link = {
  id: string;
  a: string;
  b: string;
  points: Point[];
  kind: LinkKind;
  width: number;
  plan: number;
  length: number;
  drop: number;
  lanes: number;
  designedLanes?: number;
  laneFamily?: string;
  storage: number;
  accessible: boolean;
  directions: "both" | "forward";
  row?: string;
  closed: boolean;
  barrierSlot: boolean;
  provenance: string;
  confidence: "inferred" | "plan-topology";
};
export type Row = {
  id: string;
  section: "orchestra" | "mezzanine" | "balcony";
  count: number;
  origin: string;
  ends: [string, string];
  links: [string, string];
  wheelchair: boolean;
};
export type Wall = { a: Point; b: Point; source: string };
export type Geometry = {
  version: string;
  nodes: Record<string, Node>;
  links: Record<string, Link>;
  rows: Row[];
  walls: Wall[];
  columns: (Point & { radius: number })[];
  adjacency: Record<string, { link: string; to: string; dir: 1 | -1 }[]>;
};
export type ManagerConfig = {
  id: string;
  node: string;
  exit: Exit;
  patrol?: string[];
};
export type SignConfig = {
  id: string;
  node: string;
  exit: Exit;
  kind: "wall" | "strip";
  link?: string;
  dynamic: boolean;
  existing: boolean;
  facing: [number, number];
  activation: number;
  range: number;
  detection: number;
  acceptance: number;
  halfAngle: number;
};
export type Barrier = {
  link: string;
  length: number;
  angle: number;
  direction: "both" | "forward";
};
export type Config = {
  version: 1;
  geometryVersion: string;
  name: string;
  dt: number;
  cutoff: number;
  speedMean: number;
  speedSD: number;
  olderShare: number;
  olderMultiplier: number;
  stairRatio: number;
  olderStairRatio: number;
  recognitionMedian: number;
  responseMedian: number;
  logSD: number;
  familiarityShare: number;
  knowledge: number;
  managerCompliance: number;
  environment: number;
  returnPolicy: "available-lane" | "wait-for-lane";
  announcement: boolean;
  managers: ManagerConfig[];
  signs: SignConfig[];
  barriers: Barrier[];
  closures: string[];
  dimensions: Record<string, { width?: number; drop?: number }>;
};
export type State =
  | "recognition"
  | "response"
  | "group-wait"
  | "row-wait"
  | "moving"
  | "queuing"
  | "outside"
  | "assistance"
  | "street";
export type Person = {
  id: number;
  row: string;
  section: Row["section"];
  seat: number;
  seatPoint: Point;
  seatFraction: number;
  wheelchair: boolean;
  older: boolean;
  speed: number;
  radius: number;
  recognition: number;
  response: number;
  group: number[];
  leader: number;
  familiarity: number;
  taste: Record<Exit, number>;
  compliance: number;
  known: Exit[];
  blocked: Set<string>;
  state: State;
  progress: number;
  responseAt: number;
  readyAt: number;
  node: string;
  link: string | null;
  dir: 1 | -1;
  lane: number;
  remaining: number;
  entered: number;
  queueAt: number;
  destination?: Exit;
  guidance?: { source: string; exit: Exit; priority: number };
  route: string[];
  review: boolean;
  exitTime: number | null;
  streetTime: number | null;
  exit?: Exit;
  waiting: number;
  heard: Set<string>;
  noticed: Set<string>;
};
export type Event = {
  time: number;
  person?: number;
  type: string;
  detail: string;
};
export type Lane = {
  direction: 1 | -1 | 0;
  people: number[];
  credit: number;
  accepting?: boolean;
};
export type LinkState = {
  lanes: Lane[];
  gateCredit: number;
  wheelchairCount: number;
  peak: number;
  peakQueue: number;
  peakDensity: number;
  denseSeconds: number;
  requests: [number, number];
  history: [number, number, number][];
};
export type Observation = {
  link: string;
  queue: number;
  closed: boolean;
  at: number;
  localAt: number;
  deliveryAt: number;
};
export type RunResult = {
  engineVersion: string;
  seed: number;
  config: Config;
  status: "complete" | "unresolved";
  clearance: number | null;
  clearanceBound: string;
  streetClearance: number | null;
  outside: number;
  street: number;
  success180: boolean;
  exitUsage: Record<Exit, number>;
  queueMax: number;
  waitingTimes: number[];
  linkHistory: Record<string, [number, number, number][]>;
  links: Record<
    string,
    {
      peak: number;
      peakQueue: number;
      peakDensity: number;
      denseSeconds: number;
    }
  >;
  timeline: { time: number; outside: number; street: number; queued: number }[];
  accessible: {
    id: number;
    exitTime: number | null;
    streetTime: number | null;
  }[];
  events: Event[];
};
