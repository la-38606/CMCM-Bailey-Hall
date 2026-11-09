# Implementation decisions and uncertainty register

## Authority and review

`Bailey_Hall_Model_Final_Defensible.tex` is the mathematical authority. The entire source and its 13-page PDF were reviewed, including equations, diagrams and bibliography. The problem statement's text and four drawing pages (first floor, balcony, lower seating and balcony seating), `cross_aisle_01` through `04`, and `interior_01` and `02` were examined. No previous simulator branch, external implementation, or cached simulator was consulted.

The following choices complete conventions the paper leaves open. They must not be mistaken for Bailey measurements. The input values specified in the paper remain explicit in the configuration or in their equation implementations. The 180-second benchmark is never used inside movement, routing, or parameter selection.

## Geometry and provenance

Coordinates are metres in a north-up local plane with the stage at the top. `outline` in `geometry.ts` is a 13-station piecewise horseshoe reconstructed from the plans: long straight side blocks transition into the curved rear. The main-floor and balcony outlines share plan coordinates; floor indices distinguish them. This is not a circular amphitheatre generator. The exact curvature and intermediate surveyed wall vertices are unavailable.

The nine auditorium openings are at stations 0, 1, 3, 4, 6, 8, 9, 11 and 12. Four portico doors connect the side corridors to exterior landings; three foyer doors connect the rear corridor to the foyer, and five separate doors cross its exterior boundary. The front stage paths and the two direct northern balcony escape paths remain distinct exit groups. Rear balcony stairs contain two flights and an intermediate landing, with two expressly divided logical lanes. The map draws each link's actual polyline, not a separate illustration used for physics.

| Item | Reconstruction convention | Evidence / uncertainty |
| --- | --- | --- |
| Scale | Auditorium perimeter roughly 32 m across, rear about 25 m from stage reference | Estimated against labelled 20–22 inch seats and row lengths; not a survey |
| Ordinary longitudinal/radial aisles | 1.2 m usable width | Inferred from clear gaps in seating plans |
| Curved external corridor | 2.4 m | Inferred; editable per segment |
| Auditorium / portico doors | 1.4 m | Inferred total opening; leaf operation unverified |
| Foyer approach / exterior doors | 1.8 / 1.5 m | Inferred; five exterior doors modelled separately |
| Rear balcony stairs | 1.8 m, two lanes, two 2.1 m vertical drops | Two-flight topology and central division visible; dimensions inferred |
| Orchestra ascents | 0.54 or 0.72 m vertical difference | Six access locations from plan; elevations inferred |
| Stepped middle connectors | 1.2 m horizontal run, 1.2 m width, 0.54 m drop (three assumed 0.18 m risers) | Enlarged connector drawings establish public stepped passage, not exact surveyed dimensions |
| Columns | 0.35 m radius at outer balcony stations | Photos and balcony drawing; approximate positions/radii |
| Manager posts, sign locations | Named graph junctions | Intervention assumptions, editable; not surveyed operating positions |
| Barrier slots | Interior corridor segments | Candidate locations, not installation approvals |

A 1.2 m gap separates orchestra row indices 9 and 10. Each side has a transverse outer passage, a curved-aisle junction, the short stepped link, and a level inner continuation to the inner longitudinal aisle. The longitudinal links are split at the junction; no row is reused as the cross-aisle. Only six stair accesses connect the orchestra's regular seating circulation to the mezzanine. The stage escape routes are additional emergency paths, as in the source. The outer cross-aisle itself does not create an invented level wheelchair ramp to the mezzanine.

The ordinary orchestra rows are represented as 19 central blocks and two sets of 19 side blocks. The 527 places are allocated as 323 central and 102 on each side. Five mezzanine rows in twelve sectors receive 483 chairs, weighted by their plan span; three separate wheelchair places bring the section to 486. The three balcony rows receive 316 places by the same span-allocation convention. These counts **preserve section totals, not every small printed seat label**. Seat fractions distribute people uniformly within each represented row. Chair-by-chair survey reconciliation remains an important geometry limitation.

The three wheelchair origins are placed at raised-level rear aisle stations 4, 6 and 8, with 1.1 m access. This reconciles the brief's 1,010 drawn lower-level chairs with its 1,013 lower-level audience places. It is an assumed placement, not verification of current wheelchair locations. Each has a tested step-free route to an exterior landing. No wheelchair takes stairs, including the short stepped connectors, or the elevator.

Walls along the main auditorium perimeter and foyer partition have explicit openings; balcony columns obstruct rays. The photographs support open sightlines within the hall, not sight through those walls. Shaft walls, detailed mouldings, exit hardware, head occlusion, smoke optics and exact balcony parapet heights are not resolved. A traveller on an inter-floor stair is assigned the entry floor until reaching its end, then the destination floor; this convention works in either travel direction. This is a 2.5D visibility approximation, not a full architectural visibility survey.

## Physical network and event order

The clock is an integer tick multiplied by `dt`; reference 0.1 s and refinement 0.0125 s. The horizon must be an integer number of steps. The state advances in this order:

1. Advance feasible manager patrol positions; at integer simulated seconds deliver matured reports, update eligible public messages, and evaluate hearing/sign exposure.
2. Snapshot original neighbours' recognition state. Advance recognition progress, response and capped companion waiting; advance the remaining distance of occupants already on links.
3. Advance the simulated clock to the end of the interval. Build row-admission and lane-head transfer requests. Only lane heads make junction decisions; people behind them cannot overtake or make an advance physical transfer.
4. Accrue bounded fractional walking and gate service; assemble directional requests; assign shared logical lanes. Order competing requests by queue/readiness time, then occupant ID.
5. Atomically transfer a person only when source walking service, receiving gate service, body fit, permitted direction/lane and receiving storage all permit it. Failed requests spend no credits. A fresh entrant never walks on the new link in the same interval.
6. Update occupancy/queue/density maxima, check conservation/transition/accessibility/storage invariants, and sample aggregate metrics at one-second intervals.

A lane's credit ceiling is `1 + rate * dt`: less than one discharge interval plus one step of service. This carries fractional service without storing a long idle burst. Gate credits are shared across all lanes and both directions. A blocked earliest gate request prevents later requests from overtaking that formed gate queue. General passages use independent lane FIFO. There is no massless junction holding area or unbounded node storage.

All source-prescribed headway, specific-flow, boundary-loss and storage equations are used. Stair entrance rates use the sum of lane-effective widths. Mean representative stair service uses the configured mixture of the ordinary and older stair ratios; individual travel uses each person's own speed and age ratio. Ordinary aisle service uses the configured free-speed mean. No perceived congestion penalty slows physical walking.

Physical lanes continue through consecutive segments of an uninterrupted aisle. `laneFamily` joins the segments of each longitudinal spine, rear perimeter, corridor and radial aisle with the same lane count. Their direction assignments are coordinated, but **every segment retains its own finite storage and service**. Without this convention, splitting one physical aisle at successive seat-row junctions can assign every lane of adjoining segments head-on. For odd counts the older request receives the extra lane. Occupied lanes are retained; excess lanes stop new admissions and drain before reassignment. Width changes split a family and can introduce a real merge bottleneck.

A valid return traversal consumes a whole new positive walking length. Source and destination may be the same physical link: the transfer releases one occupied slot and reacquires one, without demanding a fictitious spare slot. A lane can reverse only if its last occupant has left and its continuous family is clear in that logical lane. Direction changes propagate across the family before later requests are considered.

`returnPolicy: "available-lane"` treats an immediate reversal without a physically available return lane as locally infeasible and searches connected onward paths. If none exist, it keeps the return request and waits. A previously feasible return that becomes blocked triggers another local review. The alternative `"wait-for-lane"` retains the desired return and can produce persistent spillback. The named `strict-return-wait` scenario measures that influential convention. No person teleports, changes a live lane's direction, or receives free junction storage to resolve a jam.

A person must fit the actual clear width. A wheelchair reserves a passage narrower than 1.5 m exclusively until it clears, a conservative body-space convention for narrow two-logical-lane aisles. The person-count storage ceiling still applies; wider links use the network approximation rather than continuous collision avoidance.

Seat rows have independent forward-only left and right release links and body-spacing storage. Each person selects the nearer half/end (ties go left) and walks their actual initial distance from their seat, without a row speed multiplier. Initial release order is readiness time then ID. No public adjacency enters a row. Choosing an initially farther row end is not optimized; row occupancy does not simulate stepping over seated neighbours. Both conventions are limitations of this queue-network reconstruction.

## Randomness, recognition, companionship and information

FNV-1a string hashing seeds Mulberry32 streams. Box–Muller provides normal draws. Named keys separate audience traits, social groups, exit tastes, familiarity, manager acceptance, person–sign notice/acceptance, staff activation, hearing intervals, announcements and assisted descent. No renderer state, animation frame timing, wall clock or `Math.random` enters the engine.

Audience generation consumes its own fixed streams independently of interventions. Age is Bernoulli rather than forcing an exact older count. Groups are sampled as adjacent free seat segments until approximately half the audience is assigned, using 70/20/10% pair/trio/quartet draws. The final group is constrained by the remaining audience budget; row-end feasibility can slightly affect realised shares. Leader is the lowest seat-order ID in that group. Immediate left/right original-seat neighbours define recognition influence. Group waiting starts when the person's own response completes and lasts until all companions are ready or 20 s elapse. Local matching uses the slowest group member on the same link/direction within 4 m, evaluated from a snapshot of remaining distances at the start of the integration interval. Only followers adopt another group member’s destination; solo occupants and leaders still apply the ordinary utility-review rule.

The reference knowledge set contains signed exits on the relevant level; the reduced-knowledge scenario retains the foyer and independently omits other exit groups. Knowledge concerns topology, not remote closure or queue states. Actual closure flags do not enter perceived shortest-path searches. Local observation or a delivered report adds a closure to persistent knowledge. Paths obey row restrictions, body width, stairs and known directions. Dijkstra evaluates individual nominal travel plus visible gate waiting. The Gumbel taste is `-4 log(-log(U))`, fixed per person–exit, and the 12 s foyer allowance and 8 s switching margin are applied exactly.

A waiting lane's people are attributed to the gate requested by its head when estimating the visible gate queue. This is an aggregate queue estimate, not a detailed mixed-destination line survey. Invisible queues never contribute. Queue observations can trigger a new junction review once a one-second observation changes the visible wait estimate's 8-second band; unchanged information does not create frame-by-frame independent choice lotteries. Ordinary aisle occupancy does not enter utility.

Accepted feasible manager instructions take precedence; otherwise feasible group-leader destinations precede the person's own persistent utilities. A newly infeasible instruction is logged and released. The ordinary-departure case disables active manager guidance; it does not assert that a real concert has no staff. Managers represent instruction sources rather than staff bodies or a staffing compliance audit. Managers have public messages at their actual posts; default west-side staff recommend western routes, east-side staff eastern routes. Hearing uses an independent person–manager–integer-second draw and `1-exp(-0.35)`; acceptance remains the persistent per-person draw. Hearing can start response, but signs and an advance announcement do not erase recognition/response/group delays.

Existing signs use detection 0.38 and the added-sign geometric range/cone and acceptance conventions. Their directions are an inferred mapping from signed doors to nearby exterior routes; this is not a documented inventory of existing sign arrows. Added strips use segment sampling at ≤0.5 m. Static/dynamic installations have stable notice and compliance draws. Distinct changed messages may be noticed again without resampling those tendencies.

Managers observe only gates visible within 15 m. Reports become local after 2 s and reach the controller after 5 s in total. Latest reports persist until replaced. Unreported routes use nominal travel, not measured zero queues. Dynamic public messages use the 8 s improvement threshold and 20 s hold. Mobile patrols must form a closed sequence of direct, connected, level, non-gated links at least 1.8 m wide; staff pause above 2 persons/m² on the next segment. That occupancy screen is an explicit assumed operational restriction. Staff move at 1 m/s and do not consume audience service.

## Barriers and exterior/assistance endpoints

Only low transparent belts/rails are represented. Projected span is exactly `abs(length*sin(angle))`. The centreline receives a midpoint lateral detour of half that span; its polyline length, usable width, lanes, storage and service are recomputed. Optional direction restrictions are explicit. A full span closes the passage; a partial span below 1.1 m or one that removes accessible connectivity is rejected. Devices cannot occupy rows or door thresholds. This screen is not building-code certification, and the midpoint detour is an approximate free-end bypass, not a detailed obstacle collision solver.

Exterior crossing is the primary endpoint. Ordinary street arrival adds an assumed free stair walk: 12 m at the foyer, 8 m at a portico, 3 m after other escape routes, using individual stair speed. External crowd accumulation, landing spillback, and an external stair queue are **not** simulated; street times for ambulatory people are supplementary estimates. The external path lengths need measurement.

Wheelchair users cross an accessible exterior doorway first and wait outside for one of two teams. Team availability is 60 s. Exterior arrival order assigns the earliest available team (team index breaks ties). A person's independent lognormal descent duration has median 60 s and log SD 0.4. Teams serve sequentially without an additional invented return-trip duration. This omits spatial travel between landings and specialist equipment. Exterior crossing remains part of full audience clearance; street arrival is distinct and may occur later or remain pending at the horizon.

## Reporting and implementation limits

One-second aggregate timelines, per-person total queue waits, and per-link peak occupancy, queue, density and duration above 2 persons/m² accompany complete event logs. Sparse link histories retain [time, occupancy, queue] whenever a sampled value changes; dividing occupancy by the recorded geometry’s plan area reconstructs the sampled density history. Unchanged intervals hold their preceding value. This density is a reporting level, not an injury threshold. All unfinished building-clearance replications are censored at 900 s, remain in success denominators, and prevent an unconditional mean. Paired differences are omitted for censored pairs. Quantiles linearly interpolate ordered completed observations. Wilson 95% intervals describe binomial sampling uncertainty, not model, geometry or parameter uncertainty.

The browser worker, live display and CLI import the same `Simulation`. Tests compare complete browser/Node event outputs, including a real Chrome worker batch. Versioned JSON captures all interventions and metric overrides; geometry's version identifies the retained reconstruction. Source changes require a model version change for future published studies.

Remaining physical uncertainty includes chair-by-chair inventory, wall/column survey, actual accessible seat locations, all inferred usable widths/rises, exit operation, and post/installation feasibility. Smoke, injuries, pushing, contacts, staff bodies, detailed seated-person interactions, external landing congestion, equipment logistics and behavioural calibration are not implemented. These exclusions prevent treating the output as an operational evacuation plan or certification.
