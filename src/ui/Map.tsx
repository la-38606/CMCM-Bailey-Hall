import { useState } from "react";
import { pointOnLink } from "../engine/geometry";
import { occupancy } from "../engine/transport";
import { visible } from "../engine/perception";
import type { Simulation } from "../engine/simulation";
export type Layers = {
  edges: boolean;
  widths: boolean;
  zones: boolean;
  cross: boolean;
  rays: boolean;
  people: boolean;
};
export function MapView({
  sim,
  floor,
  layers,
  selected,
  onPerson,
  onLink,
}: {
  sim: Simulation;
  floor: number;
  layers: Layers;
  selected: number | null;
  onPerson: (id: number) => void;
  onLink: (id: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const g = sim.geometry;
  const person = selected !== null ? sim.people[selected] : null;
  return (
    <div className="map-wrap">
      <div className="map-tools">
        <span className="pill">N ↑ &nbsp; PLAN RECONSTRUCTION</span>
        <button
          onClick={() => setZoom(Math.max(1, zoom - 0.25))}
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          onClick={() => setZoom(Math.min(2.5, zoom + 0.25))}
          aria-label="Zoom in"
        >
          +
        </button>
        <button onClick={() => setZoom(1)}>Fit</button>
      </div>
      <svg
        className="building-map"
        viewBox={`${-25 / zoom} ${17 - 22 / zoom} ${50 / zoom} ${44 / zoom}`}
        role="img"
        aria-label={`Bailey Hall ${floor === 0 ? "orchestra and mezzanine" : "balcony"} evacuation map`}
      >
        <defs>
          <pattern id="grid" width="2" height="2" patternUnits="userSpaceOnUse">
            <path
              d="M 2 0 L 0 0 0 2"
              fill="none"
              stroke="#dce3df"
              strokeWidth=".025"
            />
          </pattern>
        </defs>
        <rect x="-60" y="-40" width="120" height="120" fill="url(#grid)" />
        {layers.zones && (
          <g fill="#e0e6df" stroke="#b5c0b7" strokeWidth=".07">
            <path d="M-17 0 L-17 11 Q-17 26 0 27 Q17 26 17 11 L17 0 L12 0 L12 12 Q12 21 0 22 Q-12 21-12 12 L-12 0Z" />
            <rect x="-8" y="29" width="16" height="4" rx=".3" />
          </g>
        )}
        <path d="M-10 -1 L10 -1 L10 1 Q0 3-10 1Z" fill="#233c39" />
        <text x="0" y=".8" textAnchor="middle" className="svg-stage">
          STAGE · NORTH
        </text>
        {Object.values(g.links)
          .filter((e) => e.kind !== "row" && g.nodes[e.a].floor === floor)
          .map((e) => {
            const s = sim.links[e.id],
              density = occupancy(s) / (e.plan * e.width || 1),
              cross = e.id.startsWith("cross-"),
              color = e.closed
                ? "#c15145"
                : cross && layers.cross
                  ? "#ce8a30"
                  : density > 2
                    ? "#b64e37"
                    : density > 1
                      ? "#daae55"
                      : "#c6d2ca";
            return (
              <g key={e.id} onClick={() => onLink(e.id)} className="map-link">
                <polyline
                  points={e.points.map((p) => `${p.x},${p.y}`).join(" ")}
                  stroke={color}
                  strokeWidth={Math.max(0.12, e.width * 0.55)}
                  fill="none"
                  strokeLinecap="round"
                  opacity={0.8}
                />
                {layers.edges && (
                  <polyline
                    points={e.points.map((p) => `${p.x},${p.y}`).join(" ")}
                    stroke={e.kind === "stair" ? "#8b653a" : "#657f76"}
                    strokeWidth=".055"
                    strokeDasharray={e.kind === "stair" ? ".16 .12" : undefined}
                    fill="none"
                  />
                )}
                {layers.widths && (
                  <text
                    className="svg-width"
                    x={pointOnLink(e, 0.5).x}
                    y={pointOnLink(e, 0.5).y}
                  >
                    {e.width.toFixed(1)}
                  </text>
                )}
                <title>
                  {e.id} · {e.width.toFixed(2)} m · {e.lanes} lanes ·{" "}
                  {occupancy(s)}/{e.storage} occupants · {e.provenance}
                </title>
              </g>
            );
          })}
        {g.rows
          .filter((r) => g.nodes[r.origin].floor === floor)
          .map((r) => {
            const a = g.nodes[r.ends[0]],
              b = g.nodes[r.ends[1]];
            return (
              <line
                key={r.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#ccd2c9"
                strokeWidth=".3"
              />
            );
          })}
        {g.walls
          .filter((w) => w.a.floor === floor)
          .map((w, i) => (
            <line
              key={i}
              x1={w.a.x}
              y1={w.a.y}
              x2={w.b.x}
              y2={w.b.y}
              stroke="#334e48"
              strokeWidth=".14"
            />
          ))}
        {g.columns
          .filter((c) => c.floor === floor)
          .map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y} r={c.radius} fill="#7f9087" />
          ))}
        {layers.people &&
          sim.people
            .filter(
              (p) => p.exitTime === null && sim.position(p).floor === floor,
            )
            .map((p) => {
              const pos = sim.position(p),
                laneOffset = p.link
                  ? (p.lane - (sim.links[p.link].lanes.length - 1) / 2) * 0.15
                  : 0;
              return (
                <circle
                  key={p.id}
                  cx={pos.x + laneOffset}
                  cy={pos.y}
                  r={p.id === selected ? 0.32 : p.wheelchair ? 0.23 : 0.105}
                  fill={
                    p.id === selected
                      ? "#11605c"
                      : p.wheelchair
                        ? "#476db0"
                        : p.state === "queuing"
                          ? "#ae583a"
                          : p.state === "recognition" || p.state === "response"
                            ? "#83988b"
                            : "#2d7061"
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onPerson(p.id);
                  }}
                  className="person-dot"
                >
                  <title>
                    Person {p.id} · {p.state} · {p.section}
                  </title>
                </circle>
              );
            })}
        {Object.values(g.nodes)
          .filter(
            (n) =>
              n.exit &&
              n.floor === floor &&
              Object.values(g.links).some((e) => e.b === n.id),
          )
          .map((n) => (
            <g key={n.id}>
              <rect
                x={n.x - 0.45}
                y={n.y - 0.25}
                width=".9"
                height=".5"
                rx=".1"
                fill="#237565"
              />
              <text
                x={n.x}
                y={n.y + 0.14}
                textAnchor="middle"
                className="svg-exit"
              >
                ↗
              </text>
            </g>
          ))}
        {sim.guidance.managers
          .filter((m) => m.position.floor === floor)
          .map((m) => (
            <g key={m.config.id}>
              <circle
                cx={m.position.x}
                cy={m.position.y}
                r=".47"
                fill={sim.time >= m.activation ? "#234c43" : "#95a49c"}
                stroke="#fff"
                strokeWidth=".12"
              />
              <text
                x={m.position.x}
                y={m.position.y + 0.12}
                textAnchor="middle"
                className="svg-manager"
              >
                {m.config.id.replace("CM", "")}
              </text>
              <title>
                {m.config.id} · {m.message} · activates{" "}
                {m.activation.toFixed(1)} s
              </title>
            </g>
          ))}
        {sim.guidance.signs
          .filter(
            (s) => !s.config.existing && g.nodes[s.config.node].floor === floor,
          )
          .map((s) => {
            const n = g.nodes[s.config.node];
            const e = s.config.link ? g.links[s.config.link] : null;
            return (
              <g key={s.config.id}>
                {e ? (
                  <polyline
                    points={e.points.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke="#49bcb0"
                    strokeWidth=".22"
                  />
                ) : (
                  <rect
                    x={n.x - 0.3}
                    y={n.y - 0.3}
                    width=".6"
                    height=".6"
                    fill="#49bcb0"
                  />
                )}
                <title>
                  {s.config.id} → {s.message}
                </title>
              </g>
            );
          })}
        {sim.config.barriers.map((b) => {
          const e = g.links[b.link],
            a = e.points[0],
            z = e.points.at(-1)!;
          if (a.floor !== floor) return null;
          const dx = z.x - a.x,
            dy = z.y - a.y,
            length = Math.hypot(dx, dy),
            span = Math.abs(b.length * Math.sin((b.angle * Math.PI) / 180)),
            originalWidth = e.width + span,
            // Side anchor and relative angle agree with the physical detour.
            x = (a.x + z.x) / 2 + ((dy / length) * originalWidth) / 2,
            y = (a.y + z.y) / 2 - ((dx / length) * originalWidth) / 2,
            angle =
              (Math.atan2(dy, dx) * 180) / Math.PI +
              (((b.angle % 180) + 180) % 180);
          return (
            <g key={b.link} transform={`translate(${x} ${y}) rotate(${angle})`}>
              <title>{`Open belt: ${b.length} m, ${b.angle}° relative to corridor; ${e.width.toFixed(1)} m bypass`}</title>
              <line x1={0} x2={b.length} stroke="#bc6c3f" strokeWidth=".17" />
              <circle cx={0} r=".13" fill="#895735" />
              <circle cx={b.length} r=".13" fill="#895735" />
            </g>
          );
        })}
        {layers.rays &&
          person &&
          sim.position(person).floor === floor &&
          Object.values(g.links)
            .filter(
              (e) =>
                e.kind === "door" &&
                visible(g, sim.position(person), g.nodes[e.a]),
            )
            .map((e) => {
              const a = sim.position(person),
                b = g.nodes[e.a];
              return (
                <line
                  key={e.id}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#a88632"
                  strokeWidth=".05"
                  strokeDasharray=".2 .15"
                />
              );
            })}
        <text
          x="0"
          y={floor === 0 ? 10 : 12}
          textAnchor="middle"
          className="svg-zone"
        >
          {floor === 0 ? "ORCHESTRA" : "OPEN TO BELOW"}
        </text>
        <text x="0" y="23.6" textAnchor="middle" className="svg-zone">
          {floor === 0 ? "MEZZANINE" : "BALCONY"}
        </text>
        <text x="0" y="31.2" textAnchor="middle" className="svg-zone">
          FOYER
        </text>
        <text
          x="-22"
          y="20"
          className="svg-zone"
          transform="rotate(-90 -22 20)"
        >
          WEST PORTICO
        </text>
        <text x="22" y="20" className="svg-zone" transform="rotate(-90 22 20)">
          EAST PORTICO
        </text>
        <line
          x1="-22"
          y1="35"
          x2="-17"
          y2="35"
          stroke="#64766e"
          strokeWidth=".1"
        />
        <text x="-22" y="36" className="svg-width">
          5 m · inferred scale
        </text>
      </svg>
      <div className="map-legend">
        <span>
          <i className="dot quiet" /> Responding
        </span>
        <span>
          <i className="dot moving" /> Moving
        </span>
        <span>
          <i className="dot queue" /> Queue
        </span>
        <span>
          <i className="dot wheel" /> Accessible
        </span>
        <span>
          <i className="line amber" /> Stepped cross-aisle
        </span>
      </div>
    </div>
  );
}
