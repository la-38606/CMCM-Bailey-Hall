import { distance } from "./geometry";
import type { Geometry, Point, SignConfig } from "./types";
const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
export function intersects(a: Point, b: Point, c: Point, d: Point) {
  return (
    cross(a, b, c) * cross(a, b, d) < -1e-10 &&
    cross(c, d, a) * cross(c, d, b) < -1e-10
  );
}
export function clearSight(g: Geometry, a: Point, b: Point) {
  if (a.floor !== b.floor) return false;
  for (const w of g.walls)
    if (w.a.floor === a.floor && intersects(a, b, w.a, w.b)) return false;
  for (const c of g.columns) {
    if (c.floor !== a.floor) continue;
    const dx = b.x - a.x,
      dy = b.y - a.y,
      l = dx * dx + dy * dy,
      t = l
        ? Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / l))
        : 0;
    if (Math.hypot(c.x - a.x - t * dx, c.y - a.y - t * dy) < c.radius)
      return false;
  }
  return true;
}
export function visible(
  g: Geometry,
  observer: Point,
  target: Point,
  range = 15,
) {
  return (
    observer.floor === target.floor &&
    distance(observer, target) <= range &&
    clearSight(g, observer, target)
  );
}
export function signVisible(
  g: Geometry,
  p: Point,
  s: SignConfig,
  time: number,
) {
  if (time < s.activation) return false;
  if (s.kind === "strip" && s.link) {
    const e = g.links[s.link];
    for (let i = 1; i < e.points.length; i++) {
      const a = e.points[i - 1],
        b = e.points[i],
        n = Math.ceil(distance(a, b) / 0.5);
      for (let k = 0; k <= n; k++) {
        const q = {
          x: a.x + ((b.x - a.x) * k) / n,
          y: a.y + ((b.y - a.y) * k) / n,
          floor: a.floor,
        };
        if (visible(g, p, q, s.range)) return true;
      }
    }
    return false;
  }
  const q = g.nodes[s.node];
  if (!visible(g, p, q, s.range)) return false;
  const d = distance(p, q),
    norm = Math.hypot(...s.facing);
  return (
    d < 1e-9 ||
    (norm > 0 &&
      ((p.x - q.x) * s.facing[0] + (p.y - q.y) * s.facing[1]) / (d * norm) >=
        Math.cos((s.halfAngle * Math.PI) / 180))
  );
}
