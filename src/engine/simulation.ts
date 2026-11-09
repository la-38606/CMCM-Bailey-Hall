import { validateConfig } from "./config";
import { buildGeometry, pointOnLink, validateGeometry } from "./geometry";
import { generatePopulation } from "./population";
import {
  accrue,
  allocateContinuousLanes,
  gateCapacity,
  newLinkState,
  occupancy,
  receivingLane,
  walkingCapacity,
} from "./transport";
import { visible } from "./perception";
import { chooseDestination, routes } from "./routing";
import { Guidance } from "./guidance";
import { Assistance } from "./assistance";
import { Scheduler } from "./scheduler";
import {
  EXITS,
  type Config,
  type Event,
  type Geometry,
  type LinkState,
  type Person,
  type Point,
  type RunResult,
} from "./types";
export const ENGINE_VERSION = "1.3.0";
export class Simulation {
  readonly config: Config;
  readonly geometry: Geometry;
  readonly people: Person[];
  readonly links: Record<string, LinkState>;
  readonly guidance: Guidance;
  readonly assistance: Assistance;
  readonly scheduler: Scheduler;
  events: Event[] = [];
  timeline: RunResult["timeline"] = [];
  queueCounts = new Map<string, number>();
  private neighbours: number[][];
  private rowMap: Map<string, Geometry["rows"][number]>;
  private laneFamilies: string[][];
  private familyOf = new Map<string, string[]>();
  private lastQueueReview = new Map<
    number,
    { second: number; signature: string }
  >();
  private lastSample = -1;
  private observedCache = new Map<string, string[]>();
  constructor(
    config: Config,
    readonly seed: number,
  ) {
    this.config = structuredClone(config);
    const errors = validateConfig(this.config);
    if (errors.length) throw new Error(errors.join("\n"));
    if (!Number.isSafeInteger(seed))
      throw new Error("Seed must be a safe integer");
    this.geometry = buildGeometry(this.config);
    const geoErrors = validateGeometry(this.geometry, this.config);
    if (geoErrors.length) throw new Error(geoErrors.join("\n"));
    this.people = generatePopulation(this.geometry, this.config, seed);
    this.links = Object.fromEntries(
      Object.values(this.geometry.links).map((e) => [e.id, newLinkState(e)]),
    );
    const families = new Map<string, string[]>();
    for (const e of Object.values(this.geometry.links)) {
      const key = e.laneFamily ?? e.id;
      families.set(key, [...(families.get(key) ?? []), e.id]);
    }
    this.laneFamilies = [...families.values()];
    for (const family of this.laneFamilies)
      for (const id of family) this.familyOf.set(id, family);
    this.scheduler = new Scheduler(config.dt);
    this.assistance = new Assistance(seed);
    this.rowMap = new Map(this.geometry.rows.map((r) => [r.id, r]));
    this.neighbours = this.people.map((p) =>
      this.people
        .filter((q) => q.row === p.row && Math.abs(q.seat - p.seat) === 1)
        .map((q) => q.id),
    );
    this.guidance = new Guidance(this.geometry, this.config, seed, (e) =>
      this.events.push(e),
    );
    this.guidance.announcement(this.people);
    this.sample();
  }
  get time() {
    return this.scheduler.time;
  }
  get outside() {
    return this.people.reduce((n, p) => n + Number(p.exitTime !== null), 0);
  }
  get street() {
    return this.people.reduce(
      (n, p) => n + Number(p.streetTime !== null && p.streetTime <= this.time),
      0,
    );
  }
  get done() {
    return (
      this.time >= this.config.cutoff || this.street === this.people.length
    );
  }
  position(p: Person): Point {
    if (!p.link)
      return p.exitTime === null ? p.seatPoint : this.geometry.nodes[p.node];
    const e = this.geometry.links[p.link],
      fraction = 1 - p.remaining / e.length;
    const position = pointOnLink(e, p.dir === 1 ? fraction : 1 - fraction);
    return {
      ...position,
      floor:
        this.geometry.nodes[p.remaining === 0 ? this.target(p) : p.node].floor,
    };
  }
  private observe(p: Person, node: string) {
    let gates = this.observedCache.get(node);
    if (!gates) {
      const pos = this.geometry.nodes[node];
      gates = Object.values(this.geometry.links)
        .filter(
          (e) =>
            (e.kind === "door" || e.kind === "stair" || e.closed) &&
            visible(this.geometry, pos, this.geometry.nodes[e.a]),
        )
        .map((e) => e.id);
      this.observedCache.set(node, gates);
    }
    const waits = new Map<string, number>();
    for (const id of gates) {
      const e = this.geometry.links[id];
      if (e.closed && !p.blocked.has(id)) {
        p.blocked.add(id);
        this.events.push({
          time: this.time,
          person: p.id,
          type: "learned-closure",
          detail: `${id} locally visible from ${node}`,
        });
      }
      const q = this.queueCounts.get(id) ?? 0;
      if (q && gateCapacity(e, this.config) > 0)
        waits.set(id, q / gateCapacity(e, this.config));
    }
    return waits;
  }
  private review(p: Person, node: string) {
    const old = p.destination,
      waits = this.observe(p, node);
    let options = routes(this.geometry, this.config, node, p, waits);
    // A return needs a physically available opposing lane at this junction. A new
    // instruction cannot turn an occupied lane around. Prefer connected onward
    // paths when the return lane is unavailable; if none exist, retain the request
    // and wait rather than inventing junction storage or teleporting.
    if (
      this.config.returnPolicy === "available-lane" &&
      p.link &&
      this.geometry.links[p.link].kind !== "row"
    ) {
      const state = this.links[p.link],
        edge = this.geometry.links[p.link];
      const canReturn =
        edge.directions === "both" &&
        receivingLane(
          edge,
          state,
          p.dir === 1 ? -1 : 1,
          p.radius,
          state.lanes[p.lane].people[0] === p.id ? p.lane : undefined,
          this.canReleaseLane(p),
        ) >= 0;
      if (!canReturn) {
        const onward = routes(
          this.geometry,
          this.config,
          node,
          { ...p, blocked: new Set([...p.blocked, p.link]) },
          waits,
        );
        if (onward.size) options = onward;
      }
    }
    if (p.guidance && !options.has(p.guidance.exit)) {
      this.events.push({
        time: this.time,
        person: p.id,
        type: "infeasible-guidance",
        detail: `${p.guidance.source}: ${p.guidance.exit} has no feasible path at ${node}`,
      });
      p.guidance = undefined;
    }
    p.destination = chooseDestination(
      p,
      options,
      p.leader !== p.id ? this.people[p.leader]?.destination : undefined,
    );
    p.route = p.destination ? (options.get(p.destination)?.links ?? []) : [];
    p.review = false;
    this.events.push({
      time: this.time,
      person: p.id,
      type: "route-review",
      detail: `${node}: ${p.destination ?? "no feasible known exit"}`,
    });
    if (old !== p.destination)
      this.events.push({
        time: this.time,
        person: p.id,
        type: "route-choice",
        detail: `${old ?? "unassigned"} → ${p.destination ?? "no known feasible exit"} at ${node}`,
      });
  }
  private target(p: Person) {
    return p.link
      ? p.dir === 1
        ? this.geometry.links[p.link].b
        : this.geometry.links[p.link].a
      : p.node;
  }
  private canReleaseLane(p: Person) {
    return (
      !p.link ||
      this.familyOf
        .get(p.link)!
        .every(
          (id) =>
            id === p.link || this.links[id].lanes[p.lane].people.length === 0,
        )
    );
  }
  private depart(p: Person, node: string) {
    const exit = this.geometry.nodes[node].exit!;
    p.node = node;
    p.link = null;
    p.exitTime = this.time;
    p.exit = exit;
    p.state = "outside";
    if (p.wheelchair) {
      const job = this.assistance.assign(p, this.time);
      p.state = "assistance";
      this.events.push({
        time: this.time,
        person: p.id,
        type: "assistance-assigned",
        detail: `Team ${job.team + 1}; start ${job.start.toFixed(3)}; finish ${job.end.toFixed(3)}`,
      });
    } else {
      const descent = exit === "foyer" ? 12 : exit.includes("portico") ? 8 : 3;
      p.streetTime =
        this.time +
        descent /
          (p.speed *
            (p.older ? this.config.olderStairRatio : this.config.stairRatio) *
            this.config.environment);
    }
    this.events.push({
      time: this.time,
      person: p.id,
      type: "exterior-crossing",
      detail: exit,
    });
  }
  step(steps = 1) {
    for (let k = 0; k < steps && !this.done; k++) this.tick();
    return this;
  }
  private tick() {
    const dt = this.config.dt,
      t = this.time;
    this.guidance.moveManagers(t, dt, this.links);
    this.guidance.update(
      t,
      this.people,
      this.links,
      (p) => this.position(p),
      this.queueCounts,
    );
    const reacting = this.people.map((p) => p.state !== "recognition");
    const remainingAtStart = this.people.map((p) => p.remaining);
    for (const p of this.people) {
      if (p.exitTime !== null) continue;
      if (p.state === "recognition") {
        const ns = this.neighbours[p.id];
        p.progress +=
          dt *
          (1 +
            (ns.length
              ? ns.filter((id) => reacting[id]).length / ns.length
              : 0));
        if (p.progress >= p.recognition) {
          p.state = "response";
          p.responseAt = t + dt;
        }
        continue;
      }
      if (p.state === "response" && t - p.responseAt >= p.response) {
        p.state = "group-wait";
        p.readyAt = t;
      }
      if (
        p.state === "group-wait" &&
        (t - p.readyAt >= 20 ||
          p.group.every(
            (id) =>
              !["recognition", "response"].includes(this.people[id].state),
          ))
      ) {
        p.state = "row-wait";
      }
      if (p.link) {
        const e = this.geometry.links[p.link];
        let speed = p.speed;
        for (const id of p.group) {
          const q = this.people[id];
          if (
            q.link === p.link &&
            q.dir === p.dir &&
            Math.abs(remainingAtStart[id] - remainingAtStart[p.id]) <= 4
          )
            speed = Math.min(speed, q.speed);
        }
        speed *=
          (e.kind === "stair"
            ? p.older
              ? this.config.olderStairRatio
              : this.config.stairRatio
            : 1) * this.config.environment;
        p.remaining = Math.max(0, p.remaining - speed * dt);
        if (p.remaining === 0) {
          if (p.state !== "queuing") {
            p.queueAt = t + dt;
            p.review = true;
          }
          p.state = "queuing";
        }
        if (p.state === "queuing") p.waiting += dt;
      }
    }
    // Transfers take effect at the end of the interval; entrants never walk again in this tick.
    this.scheduler.advance();
    const now = this.time;
    const requests: {
      p: Person;
      source?: string;
      sourceLane?: number;
      next: string;
      dir: 1 | -1;
      ready: number;
      rowEntry?: boolean;
    }[] = [];
    for (const p of this.people) {
      if (p.state === "row-wait") {
        const row = this.rowMap.get(p.row)!,
          side = p.seatFraction <= 0.5 ? 0 : 1;
        requests.push({
          p,
          next: row.links[side],
          dir: 1,
          ready: p.readyAt,
          rowEntry: true,
        });
      }
    }
    for (const [id, s] of Object.entries(this.links)) {
      const e = this.geometry.links[id];
      const representative =
        this.config.speedMean *
        (e.kind === "stair"
          ? this.config.stairRatio * (1 - this.config.olderShare) +
            this.config.olderStairRatio * this.config.olderShare
          : 1) *
        this.config.environment;
      for (const [i, l] of s.lanes.entries()) {
        l.credit = accrue(l.credit, walkingCapacity(1, representative), dt);
        const p = this.people[l.people[0]];
        if (!p || p.remaining > 0) continue;
        const node = this.target(p);
        if (this.geometry.nodes[node].exit) {
          if (l.credit + 1e-9 >= 1) {
            l.people.shift();
            l.credit -= 1;
            if (p.wheelchair) s.wheelchairCount--;
            this.depart(p, node);
          }
          continue;
        }
        if (
          this.config.returnPolicy === "available-lane" &&
          p.route[0] === id &&
          receivingLane(
            e,
            s,
            p.dir === 1 ? -1 : 1,
            p.radius,
            i,
            this.canReleaseLane(p),
          ) < 0
        )
          p.review = true;
        const previousReview = this.lastQueueReview.get(p.id),
          second = Math.floor(now + 1e-7);
        if (!previousReview || previousReview.second !== second) {
          const waits = this.observe(p, node),
            signature = [...waits]
              .map(([id, w]) => `${id}:${Math.floor(w / 8)}`)
              .join("|");
          if (previousReview && previousReview.signature !== signature)
            p.review = true;
          this.lastQueueReview.set(p.id, { second, signature });
        }
        if (p.review) this.review(p, node);
        let next = p.route[0];
        if (!next) {
          p.review = true;
          continue;
        }
        const target = this.geometry.links[next];
        if (target.closed) {
          if (!p.blocked.has(next)) {
            p.blocked.add(next);
            this.events.push({
              time: now,
              person: p.id,
              type: "learned-closure",
              detail: `${next} at its entrance`,
            });
          }
          this.review(p, node);
          next = p.route[0];
          if (!next) continue;
        }
        requests.push({
          p,
          source: id,
          sourceLane: i,
          next,
          dir: this.geometry.links[next].a === node ? 1 : -1,
          ready: p.queueAt,
        });
      }
      const rate = gateCapacity(e, this.config);
      s.gateCredit = Number.isFinite(rate) ? accrue(s.gateCredit, rate, dt) : 1;
      s.requests = [Infinity, Infinity];
    }
    this.queueCounts = new Map();
    for (const r of requests) {
      const s = this.links[r.next],
        index = r.dir === 1 ? 0 : 1;
      s.requests[index] = Math.min(s.requests[index], r.ready);
      if (r.source) {
        const waiting = this.links[r.source].lanes[r.sourceLane!].people.filter(
          (id) => this.people[id].remaining === 0,
        ).length;
        this.queueCounts.set(
          r.next,
          (this.queueCounts.get(r.next) ?? 0) + waiting,
        );
      }
    }
    for (const [id, s] of Object.entries(this.links)) {
      // Travelling users keep their direction active as well as holding occupied lanes.
      for (const l of s.lanes)
        if (l.people.length) {
          const i = l.direction === 1 ? 0 : 1;
          s.requests[i] = Math.min(
            s.requests[i],
            this.people[l.people[0]].entered,
          );
        }
      if (this.geometry.links[id].closed) s.gateCredit = 0;
    }
    allocateContinuousLanes(this.links, this.laneFamilies);
    requests.sort((a, b) => a.ready - b.ready || a.p.id - b.p.id);
    const blockedGates = new Set<string>();
    for (const r of requests) {
      const p = r.p,
        e = this.geometry.links[r.next],
        s = this.links[r.next],
        gated = e.kind === "door" || e.kind === "stair";
      // Opposite faces form distinct physical queues. A blocked incoming
      // request must not prevent the outgoing stream from draining the gate.
      // Both directions still spend the same gateCredit below.
      const gateQueue = `${e.id}:${r.dir}`;
      if (gated && blockedGates.has(gateQueue)) continue;
      const lane = receivingLane(
          e,
          s,
          r.dir,
          p.radius,
          r.source === r.next ? r.sourceLane : undefined,
          this.canReleaseLane(p),
          r.source &&
            r.source !== r.next &&
            p.dir === r.dir &&
            this.familyOf.get(r.source) === this.familyOf.get(r.next)
            ? r.sourceLane
            : undefined,
        ),
        source = r.source
          ? this.links[r.source].lanes[r.sourceLane!]
          : undefined;
      if (
        lane < 0 ||
        (source && source.credit + 1e-9 < 1) ||
        (gated && s.gateCredit + 1e-9 < 1)
      ) {
        if (gated) blockedGates.add(gateQueue);
        continue;
      }
      if (
        r.rowEntry
          ? e.row !== p.row
          : !this.geometry.adjacency[this.target(p)].some(
              (a) => a.link === e.id && a.dir === r.dir,
            )
      )
        throw new Error(`Illegal transition ${p.id} to ${e.id}`);
      if (p.wheelchair && !e.accessible)
        throw new Error(`Accessibility violation ${p.id} ${e.id}`);
      if (source) {
        if (source.people[0] !== p.id) throw new Error("FIFO violation");
        source.people.shift();
        source.credit -= 1;
        if (p.wheelchair) this.links[r.source!].wheelchairCount--;
      }
      if (gated) s.gateCredit -= 1;
      if (s.lanes[lane].direction !== r.dir) {
        if (s.lanes[lane].people.length)
          throw new Error("Occupied lane reversal");
        for (const member of this.familyOf.get(e.id)!) {
          const logical = this.links[member].lanes[lane];
          if (logical.people.length)
            throw new Error("Occupied continuous lane reversal");
          logical.direction = r.dir;
          logical.credit = 0;
          logical.accepting = true;
        }
      }
      s.lanes[lane].people.push(p.id);
      if (p.wheelchair) s.wheelchairCount++;
      p.node = r.dir === 1 ? e.a : e.b;
      p.link = e.id;
      p.dir = r.dir;
      p.lane = lane;
      p.remaining = e.length;
      p.entered = now;
      p.state = "moving";
      p.review = true;
      this.events.push({
        time: now,
        person: p.id,
        type: "link-entry",
        detail: `${e.id}; dir ${p.dir}; lane ${lane}`,
      });
      if (r.rowEntry)
        p.remaining = Math.max(
          0.01,
          e.length * 2 * Math.min(p.seatFraction, 1 - p.seatFraction),
        );
      else p.route.shift();
    }
    for (const p of this.people)
      if (
        p.exitTime !== null &&
        p.state !== "street" &&
        p.streetTime !== null &&
        now >= p.streetTime
      ) {
        p.state = "street";
        this.events.push({
          time: now,
          person: p.id,
          type: "street-arrival",
          detail: p.exit!,
        });
      }
    for (const [id, s] of Object.entries(this.links)) {
      const e = this.geometry.links[id],
        n = occupancy(s),
        q = s.lanes.reduce(
          (sum, l) =>
            sum +
            l.people.filter((id) => this.people[id].remaining === 0).length,
          0,
        ),
        density = n / (e.plan * e.width || 1);
      s.peak = Math.max(s.peak, n);
      s.peakQueue = Math.max(s.peakQueue, q);
      s.peakDensity = Math.max(s.peakDensity, density);
      if (density > 2) s.denseSeconds += dt;
    }
    this.assertInvariants();
    if (Math.floor(now + 1e-7) > this.lastSample || this.done) this.sample();
  }
  assertInvariants() {
    const seen = new Uint8Array(this.people.length);
    for (const [id, s] of Object.entries(this.links)) {
      const e = this.geometry.links[id];
      if (occupancy(s) > e.storage) throw new Error(`Storage overflow ${id}`);
      for (const [i, l] of s.lanes.entries()) {
        for (const n of l.people) {
          const p = this.people[n];
          if (
            ++seen[n] !== 1 ||
            p.link !== id ||
            p.lane !== i ||
            p.dir !== l.direction ||
            p.exitTime !== null ||
            p.remaining < 0 ||
            e.width + 1e-9 < p.radius * 2
          )
            throw new Error(`Invalid occupancy ${id}/${n}`);
          if (p.wheelchair && !e.accessible)
            throw new Error("Wheelchair on inaccessible link");
        }
      }
    }
    for (const p of this.people)
      if ((p.link !== null) !== ["moving", "queuing"].includes(p.state))
        throw new Error(`State/location mismatch ${p.id}`);
    for (const p of this.people)
      if (p.link ? seen[p.id] !== 1 : seen[p.id] !== 0)
        throw new Error(`Conservation failure ${p.id}`);
    if (this.people.length !== 1329)
      throw new Error("Audience conservation failure");
  }
  private sample() {
    for (const state of Object.values(this.links)) {
      const n = occupancy(state),
        q = state.lanes.reduce(
          (sum, l) =>
            sum +
            l.people.filter((id) => this.people[id].remaining === 0).length,
          0,
        ),
        previous = state.history.at(-1);
      if (!previous || previous[1] !== n || previous[2] !== q)
        state.history.push([this.time, n, q]);
    }
    this.lastSample = Math.floor(this.time + 1e-7);
    this.timeline.push({
      time: this.time,
      outside: this.outside,
      street: this.street,
      queued: this.people.filter((p) => p.state === "queuing").length,
    });
  }
  run() {
    while (!this.done) this.step(100);
    return this.result();
  }
  result(): RunResult {
    const complete = this.outside === this.people.length,
      clearance = complete
        ? Math.max(...this.people.map((p) => p.exitTime!))
        : null;
    const usage = Object.fromEntries(
      EXITS.map((e) => [e, this.people.filter((p) => p.exit === e).length]),
    ) as RunResult["exitUsage"];
    return {
      engineVersion: ENGINE_VERSION,
      seed: this.seed,
      config: this.config,
      status: complete ? "complete" : "unresolved",
      clearance,
      clearanceBound: complete
        ? `${clearance} s`
        : this.time >= this.config.cutoff
          ? `T > ${this.config.cutoff} s`
          : `In progress at ${this.time} s`,
      streetClearance:
        this.street === this.people.length
          ? Math.max(...this.people.map((p) => p.streetTime!))
          : null,
      outside: this.outside,
      street: this.street,
      success180: clearance !== null && clearance <= 180,
      exitUsage: usage,
      waitingTimes: this.people.map((p) => p.waiting),
      linkHistory: Object.fromEntries(
        Object.entries(this.links).map(([id, s]) => [id, s.history]),
      ),
      queueMax: Math.max(...Object.values(this.links).map((s) => s.peakQueue)),
      links: Object.fromEntries(
        Object.entries(this.links).map(([id, s]) => [
          id,
          {
            peak: s.peak,
            peakQueue: s.peakQueue,
            peakDensity: s.peakDensity,
            denseSeconds: s.denseSeconds,
          },
        ]),
      ),
      timeline: this.timeline,
      accessible: this.people
        .filter((p) => p.wheelchair)
        .map((p) => ({
          id: p.id,
          exitTime: p.exitTime,
          streetTime:
            p.streetTime !== null && p.streetTime <= this.time
              ? p.streetTime
              : null,
        })),
      events: this.events,
    };
  }
}
