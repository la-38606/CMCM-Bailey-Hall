# Validation and experiment report

Recorded 9 November 2026. The current branch is `bailey-hall-simulator`, renamed from `rebuild-from-scratch`. Current engine: **1.4.0**. Earlier study and review results below retain their original versions.

## Current manager-policy selection (1.4.0)

- Four policies × 100 replications, seeds 8001–8100, completed with fixed demographics, response, physical parameters, staff posts/compliance and the final-40 rule. No added LEDs or barriers.
- Selected all-six nearest-time guidance: **162.363 s mean**, **92/100** by 180 s, nominal mean CI **159.728–164.998 s**. Simultaneous mean interval over four candidates: **158.984–165.742 s**.
- All 400 runs cleared 1,329 people. All archives passed hash/event audits and four exact first-seed replays. All 741 final commitments followed their locked routes with no later updates; 22 occurred in the selected arm, including 12 exit revisions. All 300 wheelchair observations per policy reached the exterior and street within the horizon.
- **79 automated tests passed** in 83.60 s; **6 browser tests passed** in 22.8 s. TypeScript and production build passed. A stale browser expectation for CM5's former message was corrected before the passing rerun.
- The selected default matches the selected study configuration except its display title. Its complete seed-8001 result matched after normalizing that title only. The simulation rules and engine version are unchanged by selecting this default.
- The reporting t quantiles were checked independently against SciPy at ten df/probability combinations (largest absolute error below 8e-11).
- [Full comparison](manager-policy-study.md), [audit](../results/manager-policy-study/policy-audit.json) and [checks](../results/manager-policy-study/checks.json) retain evidence. This is selection among four candidates under the model, not field validation or an independent confirmation cohort.

## Initial nearest-time / final-occupant validation (1.4.0)

- Full suite: 77 tests passed in 102.57 s; after adding two further regression cases, the targeted file passed all 13 tests (79 distinct tests in total). The added tests check current rather than stale queues and inability to bypass an obstruction after commitment.
- Six browser tests passed in 33.4 s. TypeScript and production build passed.
- Twenty full runs (ten paired audiences) cleared all 1,329 people per run. Both arms averaged 182.5 s and succeeded by 180 s in 3/10 runs. Ninety final commitments occurred, with identical paired full-house clearances.
- Both sets passed archive/event audits and exact first-seed replay. The policy audit checks every locked route and subsequent absence of updates, plus five historical first-seed full-result comparisons after normalizing only the version field.
- Boundary timing is tested at 0.1 and 0.0125 s. These are rule tests, not evidence that the entire network has converged numerically.
- [Scenario definition and results](tail-policy.md), [policy audit](../results/tail-policy/policy-audit.json), and [checks](../results/tail-policy/checks.json) retain details. Historical results below are not reassigned to the new default emergency scenario.

## Historical review verification (1.3.1)

- `npm test -- --maxWorkers 1`: **66 tests passed**, four files, 79.07 s.
- `npm run build`: TypeScript and production build passed.
- `npm run test:browser`: **5 tests passed**, 21.0 s, including preserving all sixteen LED installations when changing mode.
- `node --import tsx scripts/review-replays.ts`: five complete first-seed policy results matched archived 1.3.0 results after normalizing only the engine-version field. No new 500-run study is claimed.
- [Review checks](../results/review/checks.json), [full-result replay comparisons](../results/review/replays.json), [general code review](code-review.md), and [physical placement review](research/placement-review.md) record the evidence and limits. The revised PDF separates experimental layouts from installation recommendations.

## Historical intervention study verification (1.3.0)

- `npm test -- --maxWorkers 1`: **49 tests passed**, three files, 90.68 s while Monte Carlo workers were active. Fourteen new tests cover continuous divided stairs and stepped cross-aisles, draining lanes, formerly stalled seeds, preserved sightlines/accessibility/capacity, and current-state guidance/exit commitment.
- `npm run build`: TypeScript and Vite production build passed (final Vite build 1.48 s). A separate `npm run typecheck` also passed.
- `npm run test:browser`: **4 tests passed**, 36.3 s, including complete Node/browser-worker replay equivalence and saving the LED/partial-belt study configuration.
- All **500 confirmatory runs** cleared 1,329 occupants and executed physical invariant checks. All **586** confirmatory/refinement/sensitivity archives passed hash and event-count audits, with **11** exact full-result replays (one per study policy).
- The preselected LED/partial-belt combination averaged **172.5 s** (95% CI 169.9–175.2), with **77/100** successes by 180 s. The slower-response sensitivity averaged **258.8 s**; full-network time-step sensitivity remains material. Detailed contrasts, methods and limits are in [the intervention study](intervention-study.md).

These checks validate the implementation against its declared rules; they do not supply surveyed dimensions or empirical validation of a real Bailey evacuation.

## Historical engine 1.0.0 results

The following original test and scenario results are retained without rewriting their outcomes. They are not the control arm for the revised intervention experiment. The archived 1.0.0 source is `results/monte-carlo-100/engine-source-1.0.0.tar.gz`.

## Executed checks

- `npm run typecheck`: passed.
- `npm test`: 35 tests passed in two files. They cover section counts and wheelchair inclusion; independent streams; geometry topology and provenance; restricted rows and stepped cross-aisles; body fit; finite shared lanes, continuous lane assignment and atomic returns; door/stair rates; fractional credits; conservation, spillback and positive travel; local closure learning; sightlines and persistent sign rejection; public reporting delays and holding times; assistance; censoring; and numerical refinement.
- `npm run build`: TypeScript and the Vite production build passed.
- `npm run test:browser`: three Chrome tests passed. They cover loading, play/pause/step, both floors, geometry inspection, saving, invalid-barrier feedback, a 390 px viewport, paired worker batches, JSON export and deterministic replay. Complete worker results match the Node engine for the same configuration and seed.
- The engine test additionally compares all events and metrics from a browser-targeted bundle, the direct Node module and the actual `simulate` CLI.
- `npm run simulate -- --config scenarios/emergency.json --seed 101 --out results/reference-run.json`: executed.
- `npm run batch -- --config scenarios/emergency.json --compare scenarios/concert.json --seed 101 --runs 1 --out results/paired-smoke.json`: executed.
- `npm run experiments -- --seed 101 --runs 3 --jobs 4`: executed. Four independent Node processes only change scheduling, not seed enumeration or outcomes.

The installed Node version was 22.23.1. A final standalone reference CLI run took 7.6 wall-clock seconds while refinement was running. Concurrent policy-run times varied with load; this is a development observation, not a controlled speed benchmark. A live Vite application was exercised by Chrome; desktop and mobile screenshots are retained in `results/`.

## Three-seed policy comparisons

Each named case uses seeds 101, 102 and 103. Intervention-only comparisons retain all fixed audience draws. Sensitivity cases deliberately alter their stated audience parameters. All runs use 0.1 s steps and a 900 s observation horizon. No speed, width, response or population value was adjusted to obtain a 180-second clearance.

| Scenario | Clearance by seed 101, 102, 103 · s | Resolved | All-run mean · s | Completed-only median · s | ≤180 s | Maximum link queue |
| --- | --- | --- | --- | --- | --- | --- |
| Ordinary concert departure | >900, 174.2, 191.6 | 2/3 | — | 182.9 | 1/3 | 26 |
| Six-manager concert emergency | 228.5, 207.1, 218.8 | 3/3 | 218.1 | 218.8 | 0/3 | 27 |
| Alternate manager posts | 205.3, 208.6, 207.6 | 3/3 | 207.2 | 207.6 | 0/3 | 27 |
| Twelve-manager emergency | 218.6, 210.4, 267.0 | 3/3 | 232.0 | 218.6 | 0/3 | 27 |
| Familiar student lecture | 187.7, 192.8, 184.4 | 3/3 | 188.3 | 187.7 | 0/3 | 26 |
| Unknown west portico closure | 311.9, 288.1, 281.5 | 3/3 | 293.8 | 288.1 | 0/3 | 31 |
| Static LED strips | 230.2, 227.8, 234.6 | 3/3 | 230.9 | 230.2 | 0/3 | 31 |
| Dynamic LED strips | 231.1, 205.3, 212.2 | 3/3 | 216.2 | 212.2 | 0/3 | 27 |
| Transparent corridor belts | 233.7, 206.5, 224.1 | 3/3 | 221.4 | 224.1 | 0/3 | 27 |
| Accessible evacuation and assistance | 213.8, 213.9, 255.9 | 3/3 | 227.9 | 213.9 | 0/3 | 30 |
| Slower recognition and response | 217.1, 329.6, 231.8 | 3/3 | 259.5 | 231.8 | 0/3 | 25 |
| Lower guidance compliance | 207.7, 195.7, 211.9 | 3/3 | 205.1 | 207.7 | 0/3 | 25 |
| 50% older audience | 242.8, 214.2, 224.1 | 3/3 | 227.0 | 224.1 | 0/3 | 27 |
| Slower free walking | 241.6, 205.4, 370.7 | 3/3 | 272.6 | 241.6 | 0/3 | 27 |
| Return-lane waiting sensitivity | >900, >900, >900 | 0/3 | — | — | 0/3 | 28 |
| Reduced exit knowledge | 226.3, 209.1, 242.3 | 3/3 | 225.9 | 226.3 | 0/3 | 28 |

The six-manager reference mean is **218.1 s**, median **218.8 s**, with **0/3** successes by 180 s. Its 95% Wilson success interval is 0.0%–56.2%; three seeds cannot establish a reliable success probability. Completed-only medians in censored rows are conditional, not a full clearance distribution. The all-run mean is absent for those rows. Detailed quantiles, paired differences, denominators and seeds are in [experiments.json](../results/experiments.json).

Manager counts, signs and barriers are not assumed to improve outcomes. Results reflect the particular public messages, posts and interaction rules tested; they are not an optimization of staffing or a recommendation to remove staff.

## Numerical refinement

The same emergency configuration and seed 101 were rerun with the finer interval; all other parameters stayed fixed.

| Interval | Building clearance · s | Street clearance · s | Exterior count | Peak link queue |
| --- | --- | --- | --- | --- |
| 0.1 s | 228.5 | 237.8 | 1329 | 25 |
| 0.0125 s | 215.2 | 229.7 | 1329 | 28 |

Fine minus coarse clearance is **-13.3 s** (-5.84%). This is one refinement pair, not an order-of-convergence proof. Both runs execute invariant checks at every step. Saturated isolated gate tests at both intervals deliver exactly 117 people in 100 s at the specified 1.17 people/s. Full-network route changes and lane-request tie ordering are discontinuous, so matching conservation and throughput does not prove a timestep-independent clearance estimate. The reference step is retained regardless of which result is faster.

| Exit group | Reference count | Fine-step count |
| --- | --- | --- |
| foyer | 66 | 58 |
| west-portico | 479 | 483 |
| east-portico | 451 | 448 |
| west-stage | 25 | 29 |
| east-stage | 18 | 19 |
| northwest-balcony | 151 | 151 |
| northeast-balcony | 139 | 141 |

Full logs, sparse per-link occupancy/queue histories and queue-wait totals for the pair are in [refinement.json.gz](../results/refinement.json.gz).

## Accessibility and endpoint validation

The audience includes all three wheelchair users. Each origin has a verified route to an exterior landing without stairs; the middle stepped connectors and both balcony stair systems are excluded. They are included in building clearance, and no assistance delay is silently removed from the street endpoint.

Reference seed 101:

| Person | Exterior crossing · s | Street arrival · s |
| --- | --- | --- |
| 799 | 25.3 | 140.4 |
| 800 | 35.5 | 162.3 |
| 801 | 28.9 | 113.3 |

Two teams become available at 60 s and serve queued exterior arrivals sequentially. Street arrival must be later than exterior crossing. Ordinary external stair travel is an explicit free-walk estimate; external landing crowd storage and stair queues are outside this implementation.

## Censored runs and numerical limitations

- concert, seed 101: 1325/1329 outside, 4 inside at 900 s. Remaining occupancy includes inner-L-1 (2), west-stage-approach (2).
- strict-return-wait, seed 101: 1304/1329 outside, 25 inside at 900 s. Remaining occupancy includes east-stage-approach (6), west-stage-approach (5), orchestra-center-0-left (4), inner-L-1 (4).
- strict-return-wait, seed 102: 1307/1329 outside, 22 inside at 900 s. Remaining occupancy includes west-stage-approach (6), east-stage-approach (6), orchestra-center-0-left (3), inner-L-1 (3).
- strict-return-wait, seed 103: 1304/1329 outside, 25 inside at 900 s. Remaining occupancy includes east-stage-approach (9), west-stage-approach (5), inner-R-1 (4), orchestra-L-0-left (3).

These runs remain unresolved with T > 900 s and count as failures against 180 s. Persistent queue-network gridlock is a model outcome, not evidence that the same people would remain trapped in the physical hall. In particular, the strict return-wait sensitivity exposes dependence on how reversals and finite lane storage are represented. A human crowd can use small-scale lateral motions that this queue network does not resolve. No occupant was deleted, no storage ceiling relaxed and no link capacity increased to force completion.

## Geometry confidence and remaining validation

The graph contains 421 nodes, 589 physical links and 156 represented row blocks. Plan-derived topology retains nine regular auditorium doors, six orchestra ascents, four portico doors, three foyer entrances, five foyer exterior doors and seven exit groups. Both stepped cross-aisles occupy an actual gap in the reconstructed row layout; they do not reuse a seating row. The same graph drives physics and the map.

Usable widths, the scale, elevations, individual row allocations, wheelchair placements, column positions, wall details and barrier/post positions remain inferred. The exact printed chair inventory is not transcribed, and this is not a surveyed or fully digitized CAD model. Those uncertainties cannot be validated with an automated conservation test. No measured Bailey evacuation, audience demographics or compliance data were available for calibration or external validation. Smoke, contacts, injuries, detailed seating interactions, external landing congestion and assistance-team travel between landings are excluded.

The detailed computational conventions and measurement priorities are in [implementation-decisions.md](implementation-decisions.md). These results test the supplied model under explicit assumptions; they do not certify the building or establish a safe operating plan.
