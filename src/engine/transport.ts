import type { Config, Lane, Link, LinkState } from "./types";
export function gateCapacity(e: Link, c: Pick<Config, "environment">): number {
  if (e.closed || e.width <= 0) return 0;
  if (e.kind === "door")
    return 1.3 * Math.max(0, e.width - 0.3) * c.environment;
  if (e.kind === "stair")
    return e.lanes * Math.max(0, e.width / e.lanes - 0.18) * c.environment;
  return Infinity;
}
export const walkingCapacity = (laneCount: number, speed: number) =>
  (laneCount * speed) / (0.44 + 0.7 * speed);
export function accrue(credit: number, rate: number, dt: number) {
  return Math.min(1 + rate * dt, credit + rate * dt);
}
export function newLinkState(e: Link): LinkState {
  return {
    lanes: Array.from({ length: e.lanes }, () => ({
      direction: 0,
      people: [],
      credit: 0,
    })),
    gateCredit: 0,
    wheelchairCount: 0,
    peak: 0,
    peakQueue: 0,
    peakDensity: 0,
    denseSeconds: 0,
    requests: [Infinity, Infinity],
    history: [],
  };
}
// Occupied lanes retain their direction. Empty lanes approach the fair split without evicting anyone.
export function allocateLanes(lanes: Lane[], requests: [number, number]) {
  const active = requests.map(Number.isFinite);
  const n = lanes.length;
  let plus = 0,
    minus = 0;
  if (active[0] && active[1]) {
    plus = Math.floor(n / 2) + (n % 2 && requests[0] <= requests[1] ? 1 : 0);
    minus = n - plus;
  } else if (active[0]) plus = n;
  else if (active[1]) minus = n;
  const desiredPlus = plus,
    desiredMinus = minus;
  const heldPlus = lanes.filter(
      (l) => l.people.length && l.direction === 1,
    ).length,
    heldMinus = lanes.filter(
      (l) => l.people.length && l.direction === -1,
    ).length;
  plus = Math.max(0, plus - heldPlus);
  minus = Math.max(0, minus - heldMinus);
  for (const l of lanes) {
    if (l.people.length) continue;
    const before = l.direction;
    if (plus > 0) {
      l.direction = 1;
      plus--;
    } else if (minus > 0) {
      l.direction = -1;
      minus--;
    } else l.direction = 0;
    if (before !== l.direction) l.credit = 0;
  }
  let admittedPlus = 0,
    admittedMinus = 0;
  for (const l of lanes) {
    l.accepting =
      l.direction === 1
        ? admittedPlus++ < desiredPlus
        : l.direction === -1
          ? admittedMinus++ < desiredMinus
          : false;
  }
}
export function occupancy(s: LinkState) {
  return s.lanes.reduce((n, l) => n + l.people.length, 0);
}
export function receivingLane(
  e: Link,
  s: LinkState,
  dir: 1 | -1,
  radius: number,
  departingLane?: number,
  allowLaneReversal = true,
  continuingLane?: number,
): number {
  const departing = departingLane !== undefined ? 1 : 0;
  const remainingOccupancy = occupancy(s) - departing;
  if (
    e.closed ||
    e.width + 1e-9 < radius * 2 ||
    remainingOccupancy >= e.storage ||
    (e.width < 1.5 &&
      (s.wheelchairCount > (departing && radius >= 0.45 ? 1 : 0) ||
        (radius >= 0.45 && remainingOccupancy > 0)))
  )
    return -1;
  let best = -1,
    min = Infinity;
  for (let i = 0; i < s.lanes.length; i++) {
    const l = s.lanes[i];
    if (continuingLane !== undefined && i !== continuingLane) continue;
    const n = l.people.length - (i === departingLane ? 1 : 0);
    if (
      (l.direction !== dir ||
        (l.accepting === false && continuingLane !== i)) &&
      !(allowLaneReversal && i === departingLane && n === 0)
    )
      continue;
    const capacity =
      Math.floor(e.storage / s.lanes.length) +
      (i < e.storage % s.lanes.length ? 1 : 0);
    if (n < capacity && n < min) {
      min = n;
      best = i;
    }
  }
  return best;
}

// A physical longitudinal aisle is split into links at seat-row junctions. Its
// lanes remain continuous: opposing requests cannot create head-on lane locks
// merely because the same aisle has several graph segments.
export function allocateContinuousLanes(
  states: Record<string, LinkState>,
  families: string[][],
) {
  for (const ids of families) {
    const requests: [number, number] = [Infinity, Infinity],
      combined: Lane[] = states[ids[0]].lanes.map(() => ({
        direction: 0,
        people: [],
        credit: 0,
      }));
    for (const id of ids) {
      const s = states[id];
      requests[0] = Math.min(requests[0], s.requests[0]);
      requests[1] = Math.min(requests[1], s.requests[1]);
      s.lanes.forEach((l, i) => {
        if (l.people.length) {
          if (
            combined[i].people.length &&
            combined[i].direction !== l.direction
          )
            throw new Error("Head-on lane inconsistency");
          combined[i].direction = l.direction;
          combined[i].people.push(...l.people);
        }
      });
    }
    allocateLanes(combined, requests);
    for (const id of ids)
      states[id].lanes.forEach((l, i) => {
        if (l.direction !== combined[i].direction) {
          if (l.people.length) throw new Error("Reassigning occupied lane");
          l.credit = 0;
        }
        l.direction = combined[i].direction;
        l.accepting = combined[i].accepting;
      });
  }
}
