import { useEffect, useRef, useState } from "react";
import {
  leds,
  managers,
  reference,
  emergency,
  scenarios,
} from "../engine/config";
import { Simulation, ENGINE_VERSION } from "../engine/simulation";
import { occupancy, gateCapacity } from "../engine/transport";
import { EXITS, type Config, type RunResult } from "../engine/types";
import { MapView, type Layers } from "./Map";
import { paired, summarize } from "../engine/metrics";
import { audienceComparisons } from "../scenarios/audience";
import { reviewLayout } from "../review/layout";
const presets = { ...scenarios(), ...audienceComparisons(reference()) };
const fmt = (n: number | null | undefined, d = 1) =>
  n == null ? "—" : n.toFixed(d);
function download(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
type Batch = {
  summary: ReturnType<typeof summarize>;
  comparison: ReturnType<typeof summarize>;
  pairs: ReturnType<typeof paired>;
  runs: RunResult[];
  comparisonRuns: RunResult[];
};
export function App() {
  const [config, setConfig] = useState(emergency),
    [seed, setSeed] = useState(101),
    [simulation, setSimulation] = useState(
      () => new Simulation(emergency(), 101),
    ),
    [running, setRunning] = useState(false),
    [version, render] = useState(0),
    [speed, setSpeed] = useState(8),
    [floor, setFloor] = useState(0),
    [tab, setTab] = useState<"live" | "experiments" | "geometry">("live"),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<number | null>(null),
    [selectedLink, setSelectedLink] = useState("cross-step-L"),
    [layers, setLayers] = useState<Layers>({
      edges: true,
      widths: false,
      zones: true,
      cross: true,
      rays: false,
      people: true,
    }),
    [inspector, setInspector] = useState<"person" | "link">("link"),
    [draft, setDraft] = useState(""),
    [batch, setBatch] = useState<Batch | null>(null),
    [progress, setProgress] = useState(""),
    [runs, setRuns] = useState(3),
    [compare, setCompare] = useState("concert");
  const worker = useRef<Worker | null>(null),
    file = useRef<HTMLInputElement>(null);
  function apply(next: Config, nextSeed = seed) {
    try {
      const s = new Simulation(next, nextSeed);
      setConfig(next);
      setSimulation(s);
      setRunning(false);
      setError("");
      setDraft("");
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    if (!running) return;
    let id = 0,
      last = performance.now(),
      acc = 0;
    function frame(now: number) {
      acc += Math.min(0.25, (now - last) / 1000) * speed;
      last = now;
      let steps = Math.min(100, Math.floor(acc / simulation.config.dt));
      if (steps) {
        acc -= steps * simulation.config.dt;
        try {
          simulation.step(steps);
          render((v) => v + 1);
          if (simulation.done) {
            setRunning(false);
            return;
          }
        } catch (e) {
          setError(String(e));
          setRunning(false);
          return;
        }
      }
      id = requestAnimationFrame(frame);
    }
    id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(id);
  }, [running, speed, simulation]);
  useEffect(() => () => worker.current?.terminate(), []);
  const layoutFindings = reviewLayout(simulation.geometry, config);
  const result = simulation.result(),
    person = selected === null ? null : simulation.people[selected],
    link = simulation.geometry.links[selectedLink];
  function startBatch() {
    worker.current?.terminate();
    const w = new Worker(new URL("./batch.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    setBatch(null);
    setProgress(`Running 0 / ${runs} paired seeds…`);
    w.onmessage = ({ data }) => {
      if (data.error) {
        setError(data.error);
        setProgress("");
        w.terminate();
      } else if (data.done) {
        setBatch(data);
        setProgress("");
        w.terminate();
      } else
        setProgress(`Completed ${data.progress} / ${data.total} paired seeds…`);
    };
    w.postMessage({ config, compare: presets[compare], seed, runs });
  }
  const field = (
    label: string,
    key: keyof Config,
    min: number,
    max: number,
    step: number,
  ) => (
    <label className="field" key={key}>
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={config[key] as number}
        onChange={(e) => apply({ ...config, [key]: Number(e.target.value) })}
      />
    </label>
  );
  const changeDimension = (key: "width" | "drop", value: number) =>
    apply({
      ...config,
      dimensions: {
        ...config.dimensions,
        [link.id]: { ...config.dimensions[link.id], [key]: value },
      },
    });
  return (
    <div className="app-shell" data-render={version}>
      <header className="masthead">
        <a className="brand" href="#">
          <span className="brand-mark">
            B<span>H</span>
          </span>
          <div>
            <strong>BAILEY HALL</strong>
            <span>EVACUATION LABORATORY</span>
          </div>
        </a>
        <div className="header-meta">
          <span className="status-dot" /> Deterministic network model{" "}
          <span className="version">v{ENGINE_VERSION}</span>
        </div>
        <button
          className="button ghost"
          onClick={() => download("bailey-scenario.json", config)}
        >
          ↓ Save scenario
        </button>
        <button className="button ghost" onClick={() => file.current?.click()}>
          ↑ Load
        </button>
        <input
          ref={file}
          type="file"
          accept=".json"
          hidden
          onChange={async (e) => {
            try {
              const f = e.target.files?.[0];
              if (f) apply(JSON.parse(await f.text()));
            } catch (e) {
              setError(`Invalid scenario: ${e}`);
            }
          }}
        />
      </header>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            CORNELL UNIVERSITY · BUILDING EGRESS STUDY
          </div>
          <h1>Every path. Every person.</h1>
          <p>
            Explore how movement, information, and the building shape
            evacuation.
          </p>
        </div>
        <div className="benchmark">
          <span>BUILDING-CLEARANCE BENCHMARK</span>
          <strong>
            180<span> seconds</span>
          </strong>
          <small>A criterion to evaluate, never a calibration target.</small>
        </div>
      </div>
      <nav className="tabs">
        <button
          className={tab === "live" ? "active" : ""}
          onClick={() => setTab("live")}
        >
          01 &nbsp; Live simulation
        </button>
        <button
          className={tab === "experiments" ? "active" : ""}
          onClick={() => setTab("experiments")}
        >
          02 &nbsp; Paired experiments
        </button>
        <button
          className={tab === "geometry" ? "active" : ""}
          onClick={() => setTab("geometry")}
        >
          03 &nbsp; Geometry & assumptions
        </button>
        <span>1,329 occupants · 7 exit groups · 2 floors</span>
      </nav>
      {error && (
        <div className="error" role="alert">
          <strong>Configuration rejected</strong> {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      {tab === "live" && (
        <div className="workspace">
          <aside className="panel settings">
            <div className="panel-heading">
              <span className="eyebrow">SCENARIO</span>
              <span className="small muted">Changes reset the run</span>
            </div>
            <label className="field full">
              <span>Configuration</span>
              <select
                aria-label="Configuration"
                value={
                  Object.keys(presets).find(
                    (k) => presets[k].name === config.name,
                  ) ?? "custom"
                }
                onChange={(e) =>
                  apply(structuredClone(presets[e.target.value]))
                }
              >
                <option value="custom" disabled>
                  Custom scenario
                </option>
                {Object.entries(presets).map(([k, c]) => (
                  <option key={k} value={k}>
                    {k === "lecture"
                      ? "Legacy lecture · bundled age/response assumptions"
                      : c.name}
                  </option>
                ))}
              </select>
            </label>
            {config.barriers.length > 0 && (
              <p className="small muted">
                Experimental barrier layout. Passing the geometry screen is not
                an installation recommendation; see Physical placement review
                below.
              </p>
            )}
            <div className="seed-row">
              <label className="field">
                <span>Audience seed</span>
                <input
                  aria-label="Audience seed"
                  type="number"
                  value={seed}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setSeed(n);
                    apply(config, n);
                  }}
                />
              </label>
              <span className="seed-note">
                Same seed.
                <br />
                Same audience.
              </span>
            </div>
            <details open>
              <summary>
                Audience & response <span>1,329</span>
              </summary>
              <p className="small muted">
                527 orchestra · 486 mezzanine · 316 balcony. Three wheelchair
                users are included.
              </p>
              <div className="two-col">
                {field("Free speed · m/s", "speedMean", 0.5, 2, 0.05)}
                {field("Speed SD", "speedSD", 0, 0.5, 0.01)}
                {field("Older share", "olderShare", 0, 1, 0.05)}
                {field("Recognition · s", "recognitionMedian", 1, 100, 1)}
                {field("Response · s", "responseMedian", 1, 200, 1)}
                {field("Exit knowledge probability", "knowledge", 0, 1, 0.1)}
                {field(
                  "Foyer-preference share",
                  "familiarityShare",
                  0,
                  1,
                  0.05,
                )}
              </div>
              <p className="small muted">
                Knowledge samples which exits a person initially knows. Foyer
                preference adds a persistent 12-second entrance bias; it is not
                building knowledge. The legacy lecture preset also changes age
                and response assumptions. Use the information-study presets to
                isolate knowledge or preference.
              </p>
            </details>
            <details>
              <summary>Final occupants</summary>
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!config.tailFallback}
                  onChange={(e) =>
                    apply({
                      ...config,
                      tailFallback: e.target.checked
                        ? { remaining: 40, stalledSeconds: 10 }
                        : undefined,
                    })
                  }
                />
                Lock a time-based exit after 10 seconds stuck among the last 40
              </label>
              <p className="small muted">
                Enabled for the current emergency preset. Each stalled person
                uses current travel time and visible queue delays once, then
                ignores further guidance and preference updates. It does not
                bypass blocked paths or queues.
              </p>
            </details>
            <details open>
              <summary>
                Crowd Managers <span>{config.managers.length} posts</span>
              </summary>
              <label className="field">
                <span>Staffing</span>
                <select
                  value={config.managers.length}
                  onChange={(e) =>
                    apply({
                      ...config,
                      managers: managers(Number(e.target.value)),
                    })
                  }
                >
                  {[0, 6, 8, 10, 12].map((n) => (
                    <option key={n} value={n}>
                      {n} managers{n === 6 ? " · concert minimum" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {field("Persistent acceptance", "managerCompliance", 0, 1, 0.05)}
              <label className="check">
                <input
                  type="checkbox"
                  checked={config.announcement}
                  onChange={(e) =>
                    apply({ ...config, announcement: e.target.checked })
                  }
                />{" "}
                Advance seat-block announcement
              </label>
              <details>
                <summary className="nested">
                  Edit actual posts & messages
                </summary>
                {config.managers.map((m, i) => (
                  <div className="installation" key={m.id}>
                    <strong>{m.id}</strong>
                    <select
                      aria-label={`${m.id} post`}
                      value={m.node}
                      onChange={(e) =>
                        apply({
                          ...config,
                          managers: config.managers.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  node: e.target.value,
                                  patrol: undefined,
                                }
                              : x,
                          ),
                        })
                      }
                    >
                      {Object.values(simulation.geometry.nodes)
                        .filter(
                          (n) =>
                            !n.exit &&
                            !n.id.includes("orchestra-") &&
                            !n.id.includes("mezzanine-") &&
                            !n.id.includes("balcony-") &&
                            !n.id.includes("wheelchair-"),
                        )
                        .map((n) => (
                          <option key={n.id}>{n.id}</option>
                        ))}
                    </select>
                    <select
                      aria-label={`${m.id} message`}
                      value={m.exit}
                      onChange={(e) =>
                        apply({
                          ...config,
                          managers: config.managers.map((x, j) =>
                            j === i
                              ? { ...x, exit: e.target.value as typeof x.exit }
                              : x,
                          ),
                        })
                      }
                    >
                      <option value="nearest-time">
                        Nearest exit by travel time
                      </option>
                      {EXITS.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </div>
                ))}
                <p className="small muted">
                  Mobile patrol legs can be specified in scenario JSON. Every
                  leg is checked for connection, width, stairs, and gates.
                </p>
              </details>
            </details>
            <details>
              <summary>LED guidance & barriers</summary>
              <label className="field">
                <span>Added LED strips ({config.signs.length} installed)</span>
                <select
                  value={
                    config.signs.length
                      ? config.signs.some((s) => s.dynamic)
                        ? "dynamic"
                        : "static"
                      : "none"
                  }
                  onChange={(e) =>
                    apply({
                      ...config,
                      signs:
                        e.target.value === "none"
                          ? []
                          : config.signs.length
                            ? config.signs.map((s) => ({
                                ...s,
                                dynamic: e.target.value === "dynamic",
                              }))
                            : leds(e.target.value === "dynamic"),
                    })
                  }
                >
                  <option value="none">No added LEDs</option>
                  <option value="static">Static public messages</option>
                  <option value="dynamic">
                    Dynamic · delayed staff reports
                  </option>
                </select>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={config.barriers.length > 0}
                  onChange={(e) =>
                    apply({
                      ...config,
                      barriers: e.target.checked
                        ? presets.barriers.barriers
                        : [],
                    })
                  }
                />{" "}
                Experimental open belts · not an installation recommendation
              </label>
              {layoutFindings.length > 0 && (
                <div
                  className="small"
                  role="note"
                  aria-label="Practical layout review"
                >
                  <strong>Physical placement review</strong>
                  {layoutFindings.map((f) => (
                    <p key={f.device}>
                      <b>
                        {f.device}:{" "}
                        {f.status === "not-recommended"
                          ? "not recommended for installation"
                          : "site review required"}
                        .
                      </b>{" "}
                      {f.reason}
                    </p>
                  ))}
                  <a
                    href="https://ehs.cornell.edu/campus-health-safety/event-management/event-setup"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Cornell EHS event setup guidance
                  </a>
                </div>
              )}
              {config.barriers.map((b, i) => (
                <div key={b.link} className="installation">
                  <span>{b.link}</span>
                  <label>
                    Length{" "}
                    <input
                      type="number"
                      min="0"
                      max="4"
                      step=".1"
                      value={b.length}
                      onChange={(e) =>
                        apply({
                          ...config,
                          barriers: config.barriers.map((x, j) =>
                            j === i
                              ? { ...x, length: Number(e.target.value) }
                              : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Angle{" "}
                    <input
                      type="number"
                      min="0"
                      max="180"
                      value={b.angle}
                      onChange={(e) =>
                        apply({
                          ...config,
                          barriers: config.barriers.map((x, j) =>
                            j === i
                              ? { ...x, angle: Number(e.target.value) }
                              : x,
                          ),
                        })
                      }
                    />
                  </label>
                </div>
              ))}
              <p className="small muted">
                Partial bypass ≥ 1.1 m is a model screening rule, not code
                certification.
              </p>
            </details>
            <details>
              <summary>Closures & numerical settings</summary>
              {[
                "portico-door-1",
                "portico-door-3",
                "portico-door-9",
                "portico-door-11",
                ...Array.from({ length: 5 }, (_, i) => `foyer-exit-${i}`),
                "west-stage-door",
                "east-stage-door",
              ].map((id) => (
                <label className="check" key={id}>
                  <input
                    type="checkbox"
                    checked={config.closures.includes(id)}
                    onChange={(e) =>
                      apply({
                        ...config,
                        closures: e.target.checked
                          ? [...config.closures, id]
                          : config.closures.filter((x) => x !== id),
                      })
                    }
                  />
                  {id}
                </label>
              ))}
              <label className="field">
                <span>Integration interval</span>
                <select
                  value={config.dt}
                  onChange={(e) =>
                    apply({ ...config, dt: Number(e.target.value) })
                  }
                >
                  <option value="0.1">0.1 s · reference</option>
                  <option value="0.0125">0.0125 s · refinement</option>
                </select>
              </label>
            </details>
            <details>
              <summary>Full versioned configuration</summary>
              <p className="small muted">
                All parameters, installations, patrols, and dimension overrides.
                Applying validates geometry and accessible connectivity.
              </p>
              <textarea
                aria-label="Scenario JSON"
                value={draft || JSON.stringify(config, null, 2)}
                onChange={(e) => setDraft(e.target.value)}
                rows={14}
              />
              <button
                className="button"
                onClick={() => {
                  try {
                    apply(JSON.parse(draft || JSON.stringify(config)));
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                Validate & apply JSON
              </button>
            </details>
          </aside>
          <main className="simulation-panel">
            <div className="metric-grid">
              <div>
                <span>SIMULATED TIME</span>
                <strong>
                  {fmt(simulation.time)}
                  <small> s</small>
                </strong>
                <div className="time-track">
                  <i
                    style={{
                      width: `${Math.min(100, (simulation.time / 180) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <span>OUTSIDE BUILDING</span>
                <strong>
                  {result.outside.toLocaleString()}
                  <small> / 1,329</small>
                </strong>
                <p>{fmt((result.outside / 1329) * 100)}% cleared</p>
              </div>
              <div>
                <span>IN QUEUES</span>
                <strong>
                  {
                    simulation.people.filter((p) => p.state === "queuing")
                      .length
                  }
                </strong>
                <p>Finite storage · real spillback</p>
              </div>
              <div>
                <span>ACCESSIBLE EXITS</span>
                <strong>
                  {result.accessible.filter((p) => p.exitTime !== null).length}
                  <small> / 3</small>
                </strong>
                <p>
                  {
                    result.accessible.filter((p) => p.streetTime !== null)
                      .length
                  }{" "}
                  at street level
                </p>
              </div>
            </div>
            <section className="map-panel panel">
              <div className="map-heading">
                <div>
                  <h2>The building, in motion</h2>
                  <span className="small muted">
                    Click a person or passage to inspect the model.
                  </span>
                </div>
                <div className="segmented">
                  <button
                    className={!floor ? "active" : ""}
                    onClick={() => setFloor(0)}
                  >
                    Main floor
                  </button>
                  <button
                    className={floor ? "active" : ""}
                    onClick={() => setFloor(1)}
                  >
                    Balcony
                  </button>
                </div>
              </div>
              <div className="layers">
                {Object.entries(layers).map(([key, v]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={v}
                      onChange={(e) =>
                        setLayers({ ...layers, [key]: e.target.checked })
                      }
                    />
                    {
                      (
                        {
                          edges: "Graph",
                          widths: "Widths",
                          zones: "Zones",
                          cross: "Cross-aisles",
                          rays: "Visible gates",
                          people: "People",
                        } as Record<string, string>
                      )[key]
                    }
                  </label>
                ))}
              </div>
              <MapView
                sim={simulation}
                floor={floor}
                layers={layers}
                selected={selected}
                onPerson={(id) => {
                  setSelected(id);
                  setInspector("person");
                }}
                onLink={(id) => {
                  setSelectedLink(id);
                  setInspector("link");
                }}
              />
              <div className="playback">
                <button
                  className="button primary"
                  onClick={() => setRunning(!running)}
                  disabled={simulation.done}
                >
                  {running ? "Ⅱ Pause" : "▶ Play"}
                </button>
                <button
                  className="button"
                  onClick={() => {
                    simulation.step();
                    render((v) => v + 1);
                  }}
                >
                  Step {config.dt} s
                </button>
                <button className="button" onClick={() => apply(config)}>
                  ↺ Reset
                </button>
                <label>
                  Playback{" "}
                  <select
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                  >
                    {[1, 4, 8, 16, 32].map((v) => (
                      <option key={v} value={v}>
                        {v}×
                      </option>
                    ))}
                  </select>
                </label>
                <span className="live-state">
                  {simulation.done
                    ? result.status === "complete"
                      ? `Cleared in ${fmt(result.clearance)} s`
                      : `Unresolved · ${result.clearanceBound}`
                    : running
                      ? "● Running"
                      : "● Paused"}
                </span>
              </div>
            </section>
            <div className="bottom-grid">
              <section className="panel chart-panel">
                <h3>Building clearance</h3>
                <div className="chart-label">
                  <span>People outside</span>
                  <span>Target: 180 s</span>
                </div>
                <svg
                  viewBox="0 0 450 130"
                  className="clearance-chart"
                  role="img"
                  aria-label="Building clearance over simulated time"
                >
                  <line x1="25" y1="110" x2="440" y2="110" stroke="#d3ddd7" />
                  <line
                    x1={25 + (415 * 180) / Math.max(200, simulation.time)}
                    y1="8"
                    x2={25 + (415 * 180) / Math.max(200, simulation.time)}
                    y2="110"
                    stroke="#b38b52"
                    strokeDasharray="4 4"
                  />
                  <polyline
                    points={simulation.timeline
                      .map(
                        (p) =>
                          `${25 + (415 * p.time) / Math.max(200, simulation.time)},${110 - (100 * p.outside) / 1329}`,
                      )
                      .join(" ")}
                    fill="none"
                    stroke="#277566"
                    strokeWidth="2.5"
                  />
                  <text x="0" y="15">
                    1329
                  </text>
                  <text x="15" y="124">
                    0
                  </text>
                  <text x="406" y="124">
                    {Math.max(200, simulation.time).toFixed(0)} s
                  </text>
                </svg>
                <div className="exit-bars">
                  {Object.entries(result.exitUsage).map(([exit, n]) => (
                    <div key={exit}>
                      <span>{exit.replaceAll("-", " ")}</span>
                      <div>
                        <i style={{ width: `${(n / 1329) * 100}%` }} />
                      </div>
                      <b>{n}</b>
                    </div>
                  ))}
                </div>
              </section>
              <section className="panel inspector">
                <div className="panel-heading">
                  <h3>
                    {inspector === "person"
                      ? "Person inspector"
                      : "Passage inspector"}
                  </h3>
                  <button
                    className="small-button"
                    onClick={() => download("bailey-run-events.json", result)}
                  >
                    Export run ↗
                  </button>
                </div>
                {inspector === "person" && person ? (
                  <>
                    <div className="person-title">
                      <strong>#{person.id.toString().padStart(4, "0")}</strong>
                      <span className="pill">{person.state}</span>
                    </div>
                    <dl>
                      <dt>Seat</dt>
                      <dd>
                        {person.row} / {person.seat + 1}
                      </dd>
                      <dt>Fixed traits</dt>
                      <dd>
                        {person.wheelchair
                          ? "Wheelchair"
                          : person.older
                            ? "Age 65+"
                            : "Non-older"}{" "}
                        · {fmt(person.speed, 2)} m/s · r {fmt(person.radius, 2)}{" "}
                        m
                      </dd>
                      <dt>Recognition / response</dt>
                      <dd>
                        {fmt(person.recognition)} / {fmt(person.response)} s
                      </dd>
                      <dt>Companions</dt>
                      <dd>{person.group.join(", ") || "None"}</dd>
                      <dt>Current link</dt>
                      <dd>{person.link ?? "At seat / outside"}</dd>
                      <dt>Lane / remaining</dt>
                      <dd>
                        {person.lane + 1} / {fmt(person.remaining)} m
                      </dd>
                      <dt>Total queue wait</dt>
                      <dd>{fmt(person.waiting)} s</dd>
                      <dt>Destination</dt>
                      <dd>
                        {person.destination ?? "Not chosen"}
                        {person.finalCommitment
                          ? ` · final choice locked at ${fmt(person.finalCommitment.at)} s`
                          : ""}
                      </dd>
                      <dt>Guidance</dt>
                      <dd>
                        {person.guidance
                          ? `${person.guidance.source} → ${person.guidance.exit}`
                          : "None accepted"}
                      </dd>
                      <dt>Exit knowledge</dt>
                      <dd>{person.known.join(", ")}</dd>
                      <dt>Learned closures</dt>
                      <dd>{[...person.blocked].join(", ") || "None"}</dd>
                      <dt>Exterior / street</dt>
                      <dd>
                        {fmt(person.exitTime)} /{" "}
                        {person.streetTime !== null &&
                        person.streetTime <= simulation.time
                          ? fmt(person.streetTime)
                          : "Pending"}{" "}
                        s
                      </dd>
                    </dl>
                    <div className="event-list">
                      {simulation.events
                        .filter((e) => e.person === person.id)
                        .slice(-15)
                        .map((e, i) => (
                          <p key={i}>
                            <time>{fmt(e.time)} s</time> {e.type}: {e.detail}
                          </p>
                        ))}
                    </div>
                  </>
                ) : link ? (
                  <>
                    <div className="person-title">
                      <strong>{link.id}</strong>
                      <span className="pill">{link.kind}</span>
                    </div>
                    <dl>
                      <dt>Connection</dt>
                      <dd>
                        {link.a} → {link.b}
                        {link.directions === "both" ? " (both ways)" : ""}
                      </dd>
                      <dt>Plan / walking length</dt>
                      <dd>
                        {fmt(link.plan, 2)} / {fmt(link.length, 2)} m
                      </dd>
                      <dt>Width / lanes</dt>
                      <dd>
                        {fmt(link.width, 2)} m / {link.lanes}
                      </dd>
                      <dt>Storage / gate service</dt>
                      <dd>
                        {link.storage} people /{" "}
                        {Number.isFinite(gateCapacity(link, config))
                          ? `${fmt(gateCapacity(link, config), 2)} p/s`
                          : "No gate"}
                      </dd>
                      <dt>Current / peak occupancy</dt>
                      <dd>
                        {occupancy(simulation.links[link.id])} /{" "}
                        {simulation.links[link.id].peak}
                      </dd>
                      <dt>Wheelchair route</dt>
                      <dd>{link.accessible ? "Permitted" : "Prohibited"}</dd>
                    </dl>
                    <p className="assumption-note">{link.provenance}</p>
                    <div className="two-col">
                      <label className="field">
                        Assumed width · m
                        <input
                          type="number"
                          min=".1"
                          max="10"
                          step=".1"
                          value={link.width}
                          onChange={(e) =>
                            changeDimension("width", Number(e.target.value))
                          }
                        />
                      </label>
                      <label className="field">
                        Assumed vertical drop · m
                        <input
                          type="number"
                          min="0"
                          max="10"
                          step=".18"
                          value={link.drop}
                          onChange={(e) =>
                            changeDimension("drop", Number(e.target.value))
                          }
                        />
                      </label>
                    </div>
                  </>
                ) : (
                  <p>Select a person or link on the map.</p>
                )}
              </section>
            </div>
          </main>
        </div>
      )}
      {tab === "experiments" && (
        <main className="analysis-page">
          <div className="panel experiment-form">
            <div>
              <span className="eyebrow">COMMON RANDOM NUMBERS</span>
              <h2>Compare policies on the same audience.</h2>
              <p>
                Replications run in a background worker using the same engine as
                the CLI. Unresolved runs remain in the success denominator.
              </p>
            </div>
            <label className="field">
              Current policy
              <input value={config.name} readOnly />
            </label>
            <label className="field">
              Compare against
              <select
                value={compare}
                onChange={(e) => setCompare(e.target.value)}
              >
                {Object.entries(presets).map(([k, c]) => (
                  <option key={k} value={k}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="two-col">
              <label className="field">
                First seed
                <input
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value))}
                />
              </label>
              <label className="field">
                Replications
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={runs}
                  onChange={(e) =>
                    setRuns(Math.max(1, Math.min(100, Number(e.target.value))))
                  }
                />
              </label>
            </div>
            <button
              className="button primary"
              onClick={startBatch}
              disabled={!!progress}
            >
              {progress || "Run paired experiment →"}
            </button>
            {progress && (
              <button
                className="button"
                onClick={() => {
                  worker.current?.terminate();
                  setProgress("");
                }}
              >
                Cancel batch
              </button>
            )}
            <p className="small muted">
              Seeds {seed}–{seed + runs - 1} · Δt {config.dt} s · 900 s horizon
            </p>
          </div>
          <div className="panel experiment-results">
            {batch ? (
              <>
                <div className="panel-heading">
                  <h2>Replicated results</h2>
                  <button
                    className="button"
                    onClick={() => download("bailey-paired-batch.json", batch)}
                  >
                    ↓ Export batch & logs
                  </button>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Measure</th>
                      <th>Current policy</th>
                      <th>Comparison</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      [
                        "Replications",
                        batch.summary.runs,
                        batch.comparison.runs,
                      ],
                      [
                        "Unresolved",
                        batch.summary.unresolved,
                        batch.comparison.unresolved,
                      ],
                      [
                        "≤180 s success",
                        `${fmt(batch.summary.success180 * 100)}%`,
                        `${fmt(batch.comparison.success180 * 100)}%`,
                      ],
                      [
                        "Mean · all runs",
                        fmt(batch.summary.mean),
                        fmt(batch.comparison.mean),
                      ],
                      [
                        "Completed-only median · s",
                        fmt(batch.summary.completedOnlyQuantiles.median),
                        fmt(batch.comparison.completedOnlyQuantiles.median),
                      ],
                      [
                        "Completed-only P10 / P90 · s",
                        `${fmt(batch.summary.completedOnlyQuantiles.p10)} / ${fmt(batch.summary.completedOnlyQuantiles.p90)}`,
                        `${fmt(batch.comparison.completedOnlyQuantiles.p10)} / ${fmt(batch.comparison.completedOnlyQuantiles.p90)}`,
                      ],
                      [
                        "Largest link queue",
                        batch.summary.queueMax,
                        batch.comparison.queueMax,
                      ],
                    ].map(([label, a, b]) => (
                      <tr key={label}>
                        <td>{label}</td>
                        <td>{a}</td>
                        <td>{b}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="small muted">
                  95% Wilson interval for success:{" "}
                  {batch.summary.successWilson95
                    ?.map((v) => `${fmt(v * 100)}%`)
                    .join("–")}
                  . Quantiles describe completed runs only if any remain
                  unresolved.
                </p>
                <h3>Paired clearance by seed</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Seed</th>
                      <th>Current · s</th>
                      <th>Comparison · s</th>
                      <th>Difference · s</th>
                      <th>Replay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batch.pairs.map((p, i) => (
                      <tr key={p.seed}>
                        <td>{p.seed}</td>
                        <td>{p.a === null ? ">900" : fmt(p.a)}</td>
                        <td>{p.b === null ? ">900" : fmt(p.b)}</td>
                        <td>{fmt(p.delta)}</td>
                        <td>
                          <button
                            onClick={() => {
                              setSeed(p.seed);
                              apply(batch.runs[i].config, p.seed);
                              setTab("live");
                            }}
                          >
                            Replay ↗
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <h3>Congested passages · first seed</h3>
                {Object.entries(batch.runs[0].links)
                  .sort((a, b) => b[1].peakQueue - a[1].peakQueue)
                  .slice(0, 8)
                  .map(([id, l]) => (
                    <div className="congested-row" key={id}>
                      <span>{id}</span>
                      <strong>{l.peakQueue} queued</strong>
                      <span>{fmt(l.peakDensity, 2)} p/m² peak</span>
                    </div>
                  ))}
                <h3>Exit usage · all replications</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Exit group</th>
                      <th>Current policy</th>
                      <th>Comparison</th>
                    </tr>
                  </thead>
                  <tbody>
                    {EXITS.map((exit) => (
                      <tr key={exit}>
                        <td>{exit}</td>
                        <td>
                          {batch.runs.reduce(
                            (n, r) => n + r.exitUsage[exit],
                            0,
                          )}
                        </td>
                        <td>
                          {batch.comparisonRuns.reduce(
                            (n, r) => n + r.exitUsage[exit],
                            0,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <h3>Accessible evacuation · first seed</h3>
                {batch.runs[0].accessible.map((p) => (
                  <p key={p.id}>
                    Person {p.id}: exterior {fmt(p.exitTime)} s · street{" "}
                    {fmt(p.streetTime)} s
                  </p>
                ))}
              </>
            ) : (
              <div className="empty-state">
                <span>↗</span>
                <h2>Evidence starts with a run.</h2>
                <p>
                  Choose a comparison and run paired seeds to see clearance
                  distributions, exit outcomes, queues, and accessible
                  evacuation.
                </p>
                <code>
                  npm run batch -- --config scenarios/emergency.json --seed 101
                  --runs 3 --out results/batch.json
                </code>
              </div>
            )}
          </div>
        </main>
      )}
      {tab === "geometry" && (
        <main className="geometry-page">
          <div className="panel provenance-intro">
            <span className="eyebrow">SOURCE HIERARCHY</span>
            <h2>
              Connected to the drawings.
              <br />
              Explicit about uncertainty.
            </h2>
            <p>
              The mathematical specification is the authority. The graph follows
              the supplied floor and seating plans: straight side blocks, curved
              rear circulation, nine auditorium doors, four portico doors, three
              foyer entrances, five foyer exterior doors, stage escape routes,
              and two-flight balcony stairs.
            </p>
            <div className="notice">
              These are reconstructed dimensions, not surveyed measurements.
              This simulator is not a fire-safety or building-code
              certification.
            </div>
            <p>
              Both middle orchestra cross-aisles connect to the curved
              longitudinal aisle and the inner aisle through a stepped
              connector. Their amber overlay shows the exact public links;
              wheelchair routing excludes the steps.
            </p>
            <p>
              Seat rows only release their original occupants. The elevator,
              backstage population, and ground level are excluded. Wheelchair
              places are on the raised accessible level; assistance follows
              exterior crossing.
            </p>
            <div className="source-links">
              <a href="/reference/problem.pdf" target="_blank" rel="noreferrer">
                Architectural & seating plans ↗
              </a>
              <a href="/reference/model.pdf" target="_blank" rel="noreferrer">
                Mathematical specification ↗
              </a>
              <a
                href="/reference/cross_aisle_01.png"
                target="_blank"
                rel="noreferrer"
              >
                Stepped connector detail ↗
              </a>
            </div>
          </div>
          <div className="panel geometry-table">
            <div className="panel-heading">
              <h2>Geometry register</h2>
              <span className="pill">
                {Object.keys(simulation.geometry.links).length} links
              </span>
              <button
                className="button"
                onClick={() =>
                  download("bailey-geometry.json", simulation.geometry)
                }
              >
                ↓ Export graph
              </button>
            </div>
            <p className="small muted">
              Every link exposes length, width, rise, storage, accessibility,
              and provenance. Use the passage inspector or scenario dimension
              overrides to explore measurement uncertainty.
            </p>
            <div className="scroll-table">
              <table>
                <thead>
                  <tr>
                    <th>Link</th>
                    <th>Width</th>
                    <th>Walk / plan</th>
                    <th>Rise</th>
                    <th>Access</th>
                    <th>Provenance</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(simulation.geometry.links)
                    .filter((e) => e.kind !== "row")
                    .map((e) => (
                      <tr key={e.id}>
                        <td>
                          <button
                            onClick={() => {
                              setSelectedLink(e.id);
                              setInspector("link");
                              setTab("live");
                            }}
                          >
                            {e.id}
                          </button>
                        </td>
                        <td>{fmt(e.width, 2)}</td>
                        <td>
                          {fmt(e.length, 2)} / {fmt(e.plan, 2)}
                        </td>
                        <td>{fmt(e.drop, 2)}</td>
                        <td>{e.accessible ? "Yes" : "No"}</td>
                        <td>{e.provenance}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      )}
      <footer>
        <span>BAILEY HALL / CLEAN REBUILD</span>
        <span>
          Plan-derived geometry · Uncalibrated behavioral assumptions · No
          smoke, contact forces, or injury prediction
        </span>
        <span>Engine {result.engineVersion}</span>
      </footer>
    </div>
  );
}
