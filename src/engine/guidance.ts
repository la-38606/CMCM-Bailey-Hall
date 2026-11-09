import { draw, RNG } from "./rng";
import { distance, pointOnLink } from "./geometry";
import { signVisible, visible } from "./perception";
import { routes } from "./routing";
import { gateCapacity, occupancy } from "./transport";
import type {
  Config,
  Event,
  Exit,
  Geometry,
  LinkState,
  ManagerConfig,
  Observation,
  Person,
  Point,
  SignConfig,
} from "./types";
type Manager = {
  config: ManagerConfig;
  position: Point;
  activation: number;
  node: string;
  leg: number;
  distance: number;
  reports: Map<string, Observation>;
  message: Exit;
};
export type Sign = { config: SignConfig; message: Exit; changed: number };
export class Guidance {
  managers: Manager[];
  signs: Sign[];
  pending: { manager: number; observation: Observation }[] = [];
  reports = new Map<string, Observation>();
  lastSecond = -1;
  constructor(
    public g: Geometry,
    public c: Config,
    public seed: number,
    private event: (e: Event) => void,
  ) {
    this.managers = c.managers.map((m) => ({
      config: m,
      position: { ...g.nodes[m.node] },
      activation: new RNG(seed, `activation:${m.id}`).lognormal(10, 0.5),
      node: m.node,
      leg: 0,
      distance: 0,
      reports: new Map(),
      message: m.exit,
    }));
    const existing: SignConfig[] = Object.values(g.links)
      .filter(
        (e) =>
          e.id.startsWith("auditorium-door") || e.id.endsWith("balcony-rear"),
      )
      .map((e) => ({
        id: `EXIT-${e.id}`,
        node: e.a,
        exit:
          Math.abs(g.nodes[e.a].x) < 7
            ? "foyer"
            : g.nodes[e.a].x < 0
              ? "west-portico"
              : "east-portico",
        kind: "wall",
        dynamic: false,
        existing: true,
        facing: [0, -1],
        activation: 0,
        range: 8,
        detection: 0.38,
        acceptance: 0.8,
        halfAngle: 70,
      }));
    this.signs = [...existing, ...c.signs].map((config) => ({
      config,
      message: config.exit,
      changed: config.activation,
    }));
  }
  private recommendationFeasible(p: Person, exit: Exit) {
    const start = p.link
      ? p.dir === 1
        ? this.g.links[p.link].b
        : this.g.links[p.link].a
      : this.g.rows.find((r) => r.id === p.row)!.ends[
          p.seatFraction <= 0.5 ? 0 : 1
        ];
    const visited = new Set([start]),
      stack = [start];
    while (stack.length) {
      const node = stack.pop()!;
      if (this.g.nodes[node].exit === exit) return true;
      for (const a of this.g.adjacency[node]) {
        const e = this.g.links[a.link];
        if (
          e.kind === "row" ||
          p.blocked.has(e.id) ||
          (p.wheelchair && !e.accessible) ||
          e.width < p.radius * 2 ||
          visited.has(a.to)
        )
          continue;
        visited.add(a.to);
        stack.push(a.to);
      }
    }
    return false;
  }
  private waits(reports: Map<string, Observation>) {
    return new Map(
      [...reports].map(([id, r]) => [
        id,
        r.closed ? Infinity : r.queue / gateCapacity(this.g.links[id], this.c),
      ]),
    );
  }
  private publicRoutes(node: string, reports: Map<string, Observation>) {
    return routes(
      this.g,
      this.c,
      node,
      {
        speed: this.c.speedMean,
        older: false,
        wheelchair: false,
        radius: 0.22,
        blocked: new Set(
          [...reports].filter(([, r]) => r.closed).map(([id]) => id),
        ),
      },
      this.waits(reports),
    );
  }
  moveManagers(time: number, dt: number, states: Record<string, LinkState>) {
    for (const m of this.managers) {
      if (time < m.activation || !m.config.patrol?.length) continue;
      const stops = [m.config.node, ...m.config.patrol],
        to = stops[(m.leg + 1) % stops.length],
        adj = this.g.adjacency[m.node].find((a) => a.to === to);
      if (!adj) continue;
      const e = this.g.links[adj.link];
      if (e.closed || occupancy(states[e.id]) / (e.plan * e.width) > 2)
        continue;
      m.distance += dt;
      if (m.distance >= e.length) {
        m.node = to;
        m.leg = (m.leg + 1) % stops.length;
        m.distance = 0;
        m.position = this.g.nodes[to];
      } else
        m.position = pointOnLink(
          e,
          adj.dir === 1 ? m.distance / e.length : 1 - m.distance / e.length,
        );
    }
  }
  update(
    time: number,
    people: Person[],
    states: Record<string, LinkState>,
    position: (p: Person) => Point,
    queues: Map<string, number>,
  ) {
    const second = Math.floor(time + 1e-7);
    if (second === this.lastSecond) return;
    this.lastSecond = second;
    for (const item of this.pending) {
      const o = item.observation;
      if (o.localAt <= time) this.managers[item.manager].reports.set(o.link, o);
      if (o.deliveryAt <= time) this.reports.set(o.link, o);
    }
    this.pending = this.pending.filter((i) => i.observation.deliveryAt > time);
    for (const [index, m] of this.managers.entries()) {
      if (time < m.activation) continue;
      for (const e of Object.values(this.g.links)) {
        if (!["door", "stair"].includes(e.kind) && !e.closed) continue;
        if (visible(this.g, m.position, this.g.nodes[e.a]))
          this.pending.push({
            manager: index,
            observation: {
              link: e.id,
              queue: queues.get(e.id) ?? 0,
              closed: e.closed,
              at: time,
              localAt: time + 2,
              deliveryAt: time + 5,
            },
          });
      }
      const options = this.publicRoutes(m.node, m.reports);
      if (
        !options.has(m.message) ||
        !Number.isFinite(options.get(m.message)!.time)
      ) {
        const best = [...options].sort((a, b) => a[1].time - b[1].time)[0];
        if (best) m.message = best[0];
      }
    }
    for (const s of this.signs) {
      if (
        !s.config.dynamic ||
        time < s.config.activation ||
        time - s.changed < 20
      )
        continue;
      const options = this.publicRoutes(s.config.node, this.reports),
        best = [...options].sort((a, b) => a[1].time - b[1].time)[0],
        current = options.get(s.message)?.time ?? Infinity;
      if (best && best[0] !== s.message && current - best[1].time >= 8) {
        s.message = best[0];
        s.changed = time;
        this.event({
          time,
          type: "sign-message",
          detail: `${s.config.id} → ${s.message}; delayed observations`,
        });
      }
    }
    for (const p of people) {
      if (p.exitTime !== null) continue;
      const pos = position(p);
      for (const m of this.managers) {
        if (time < m.activation || !visible(this.g, pos, m.position, 12))
          continue;
        if (
          draw(this.seed, `hearing:${p.id}:${m.config.id}:${second}`) >=
          1 - Math.exp(-0.35)
        )
          continue;
        if (!p.heard.has(m.config.id)) {
          p.heard.add(m.config.id);
          this.event({
            time,
            person: p.id,
            type: "heard-manager",
            detail: m.config.id,
          });
        }
        if (p.state === "recognition") {
          p.state = "response";
          p.responseAt = time;
        }
        for (const [id, r] of m.reports)
          if (r.closed && !p.blocked.has(id)) {
            p.blocked.add(id);
            p.review = true;
            this.event({
              time,
              person: p.id,
              type: "learned-closure",
              detail: `${id} reported by ${m.config.id}`,
            });
          }
        if (!p.known.includes(m.message)) p.known.push(m.message);
        if (
          p.compliance < this.c.managerCompliance &&
          this.recommendationFeasible(p, m.message) &&
          (!p.guidance ||
            p.guidance.exit !== m.message ||
            p.guidance.priority < 3)
        ) {
          p.guidance = { source: m.config.id, exit: m.message, priority: 3 };
          p.review = true;
          this.event({
            time,
            person: p.id,
            type: "accepted-manager",
            detail: `${m.config.id} → ${m.message}`,
          });
        }
      }
      for (const s of this.signs) {
        if (
          !signVisible(this.g, pos, s.config, time) ||
          draw(this.seed, `notice:${p.id}:${s.config.id}`) >= s.config.detection
        )
          continue;
        const key = `${s.config.id}:${s.message}`;
        if (p.noticed.has(key)) continue;
        p.noticed.add(key);
        if (!p.known.includes(s.message)) p.known.push(s.message);
        this.event({ time, person: p.id, type: "noticed-sign", detail: key });
        if (s.config.dynamic)
          for (const [id, r] of this.reports)
            if (r.closed && !p.blocked.has(id)) {
              p.blocked.add(id);
              p.review = true;
              this.event({
                time,
                person: p.id,
                type: "learned-closure",
                detail: `${id} via ${s.config.id}`,
              });
            }
        if (
          draw(this.seed, `sign-accept:${p.id}:${s.config.id}`) <
            s.config.acceptance &&
          this.recommendationFeasible(p, s.message) &&
          (p.guidance?.priority ?? 0) < 3
        ) {
          p.guidance = { source: s.config.id, exit: s.message, priority: 2 };
          p.review = true;
          this.event({
            time,
            person: p.id,
            type: "accepted-sign",
            detail: key,
          });
        }
      }
    }
  }
  announcement(people: Person[]) {
    if (!this.c.announcement) return;
    for (const p of people) {
      if (draw(this.seed, `announcement-reach:${p.id}`) < 0.6) {
        this.event({
          time: 0,
          person: p.id,
          type: "heard-announcement",
          detail: "Seat-block recommendation",
        });
        if (draw(this.seed, `announcement-accept:${p.id}`) < 0.7) {
          const exit: Exit =
            p.seatPoint.x < 0 ? "west-portico" : "east-portico";
          p.guidance = { source: "advance-announcement", exit, priority: 1 };
          if (!p.known.includes(exit)) p.known.push(exit);
        }
      }
    }
  }
}
