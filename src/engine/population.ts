import { clip, draw, RNG } from "./rng";
import { EXITS, type Config, type Geometry, type Person } from "./types";
export function generatePopulation(
  g: Geometry,
  c: Config,
  seed: number,
): Person[] {
  const people: Person[] = [];
  for (const row of g.rows) {
    const a = g.nodes[row.ends[0]],
      b = g.nodes[row.ends[1]];
    for (let seat = 0; seat < row.count; seat++) {
      const id = people.length,
        rng = new RNG(seed, `traits:${id}`),
        older = rng.uniform() < c.olderShare,
        speed = clip(
          (c.speedMean + c.speedSD * rng.normal()) *
            (older ? c.olderMultiplier : 1),
          0.5,
          2,
        ),
        radius = clip(0.22 + 0.02 * rng.normal(), 0.17, 0.3),
        recognition = rng.lognormal(c.recognitionMedian, c.logSD),
        response = rng.lognormal(c.responseMedian, c.logSD),
        fraction = (seat + 0.5) / row.count;
      const taste = Object.fromEntries(
        EXITS.map((e) => [
          e,
          -4 *
            Math.log(
              -Math.log(Math.max(1e-12, draw(seed, `taste:${id}:${e}`))),
            ),
        ]),
      ) as Person["taste"];
      const known = EXITS.filter(
        (e) =>
          (row.section === "balcony" || !e.includes("balcony")) &&
          (e === "foyer" || draw(seed, `knowledge:${id}:${e}`) < c.knowledge),
      );
      people.push({
        id,
        row: row.id,
        section: row.section,
        seat,
        seatPoint: {
          x: a.x + (b.x - a.x) * fraction,
          y: a.y + (b.y - a.y) * fraction,
          floor: a.floor,
        },
        seatFraction: fraction,
        wheelchair: row.wheelchair,
        older,
        speed: row.wheelchair ? 0.8 : speed,
        radius: row.wheelchair ? 0.45 : radius,
        recognition,
        response,
        group: [],
        leader: id,
        familiarity:
          draw(seed, `familiarity:${id}`) < c.familiarityShare ? 12 : 0,
        taste,
        compliance: draw(seed, `manager-accept:${id}`),
        known,
        blocked: new Set(),
        state: "recognition",
        progress: 0,
        responseAt: 0,
        readyAt: 0,
        node: row.origin,
        link: null,
        dir: 1,
        lane: 0,
        remaining: 0,
        entered: 0,
        queueAt: 0,
        route: [],
        review: true,
        exitTime: null,
        streetTime: null,
        waiting: 0,
        heard: new Set(),
        noticed: new Set(),
      });
    }
  }
  const groups = new RNG(seed, "groups");
  let grouped = 0;
  const target = Math.round(people.length * 0.5);
  while (grouped < target - 1) {
    const u = groups.uniform(),
      n = u < 0.7 ? 2 : u < 0.9 ? 3 : 4;
    if (grouped + n > target) continue;
    const starts = people.filter(
      (p, i) =>
        !p.group.length &&
        i + n <= people.length &&
        people.slice(i, i + n).every((q) => q.row === p.row && !q.group.length),
    );
    if (!starts.length) break;
    const start = starts[Math.floor(groups.uniform() * starts.length)].id,
      ids = people.slice(start, start + n).map((p) => p.id);
    for (const id of ids) {
      people[id].group = ids;
      people[id].leader = ids[0];
    }
    grouped += n;
  }

  return people;
}
