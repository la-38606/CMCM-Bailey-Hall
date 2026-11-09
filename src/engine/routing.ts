import type { Config, Exit, Geometry, Person, Point } from "./types";
import { visible } from "./perception";
import { gateCapacity } from "./transport";
class Heap {
  data: [number, string][] = [];
  push(v: [number, string]) {
    let i = this.data.length;
    this.data.push(v);
    while (i) {
      const p = (i - 1) >> 1;
      if (this.data[p][0] <= v[0]) break;
      this.data[i] = this.data[p];
      i = p;
    }
    this.data[i] = v;
  }
  pop() {
    const first = this.data[0],
      last = this.data.pop()!;
    if (this.data.length) {
      let i = 0;
      while (i * 2 + 1 < this.data.length) {
        let c = i * 2 + 1;
        if (c + 1 < this.data.length && this.data[c + 1][0] < this.data[c][0])
          c++;
        if (this.data[c][0] >= last[0]) break;
        this.data[i] = this.data[c];
        i = c;
      }
      this.data[i] = last;
    }
    return first;
  }
}
export type Route = { time: number; links: string[] };
export function routes(
  g: Geometry,
  c: Config,
  node: string,
  p: Pick<Person, "wheelchair" | "radius" | "older" | "speed" | "blocked">,
  waits: Map<string, number> = new Map(),
): Map<Exit, Route> {
  const heap = new Heap(),
    cost = new Map([[node, 0]]),
    prev = new Map<string, { node: string; link: string }>(),
    result = new Map<Exit, Route>();
  heap.push([0, node]);
  while (heap.data.length) {
    const [d, n] = heap.pop();
    if (d !== cost.get(n)) continue;
    const exit = g.nodes[n].exit;
    if (exit) {
      if (!result.has(exit)) {
        const path: string[] = [];
        let here = n;
        while (here !== node) {
          const a = prev.get(here)!;
          path.push(a.link);
          here = a.node;
        }
        result.set(exit, { time: d, links: path.reverse() });
      }
      continue;
    }
    for (const a of g.adjacency[n]) {
      const e = g.links[a.link];
      if (
        e.kind === "row" ||
        p.blocked.has(e.id) ||
        e.width + 1e-9 < p.radius * 2 ||
        (p.wheelchair && !e.accessible)
      )
        continue;
      // Unknown closures are deliberately not consulted here. Only geometry and learned information.
      const speed =
        p.speed *
        (e.kind === "stair"
          ? p.older
            ? c.olderStairRatio
            : c.stairRatio
          : 1) *
        c.environment;
      const next = d + e.length / speed + (waits.get(e.id) ?? 0);
      if (next < (cost.get(a.to) ?? Infinity)) {
        cost.set(a.to, next);
        prev.set(a.to, { node: n, link: e.id });
        heap.push([next, a.to]);
      }
    }
  }
  return result;
}
export function chooseDestination(
  p: Person,
  options: Map<Exit, Route>,
  leader?: Exit,
): Exit | undefined {
  const feasible = (e: Exit) =>
    options.has(e) && Number.isFinite(options.get(e)!.time);
  if (p.guidance && feasible(p.guidance.exit)) return p.guidance.exit;
  if (leader && feasible(leader) && p.known.includes(leader)) return leader;
  const utility = (e: Exit) =>
    -(options.get(e)?.time ?? Infinity) -
    p.familiarity * (e === "foyer" ? 0 : 1) +
    p.taste[e];
  const ranked = p.known
    .filter(feasible)
    .sort((a, b) => utility(b) - utility(a) || a.localeCompare(b));
  const best = ranked[0];
  if (!best) return undefined;
  if (
    p.destination &&
    feasible(p.destination) &&
    utility(best) - utility(p.destination) < 8
  )
    return p.destination;
  return best;
}

// Guidance is evaluated at the next physically reachable decision point.
// The current unfinished link must still be walked; no mid-link teleport/turn.
// Persistent preferences are not redrawn. Remote queues/closures remain unknown.
export function guidanceSwitchAllowed(
  g: Geometry,
  c: Config,
  p: Person,
  proposed: Exit,
  position: Point,
  queues: Map<string, number>,
): boolean {
  if (p.exitTime !== null) return false;
  if (!p.link) return true; // Initial instructions before movement.
  const currentLink = g.links[p.link];
  const node = p.dir === 1 ? currentLink.b : currentLink.a;
  if (g.nodes[node].exit) return false; // Already committed to exterior crossing.
  const current = p.destination ?? p.guidance?.exit;
  if (!current || current === proposed) return true;
  const waits = new Map<string, number>();
  for (const [id, q] of queues) {
    const e = g.links[id],
      capacity = gateCapacity(e, c);
    if (
      q > 0 &&
      Number.isFinite(capacity) &&
      capacity > 0 &&
      visible(g, position, g.nodes[e.a])
    )
      waits.set(id, q / capacity);
  }
  const options = routes(g, c, node, p, waits);
  const before = options.get(current)?.time ?? Infinity;
  const after = options.get(proposed)?.time ?? Infinity;
  // An inaccessible/known-blocked current route can be replaced immediately.
  return (
    Number.isFinite(after) && (!Number.isFinite(before) || before - after >= 8)
  );
}
