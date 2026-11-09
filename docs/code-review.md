# General code review — 9 November 2026

Scope: current clean-rebuild engine modules (geometry, population/RNG, transport, routing/perception, guidance, scheduler, assistance and metrics), simulation transitions, React controls/map, browser worker, CLI/batch entry points and study/report/audit scripts. Only `rebuild-from-scratch` was inspected; no former simulator branch was consulted. Plans, seating diagrams and all six reference images were reviewed again. This is a targeted source review with regression checks, not a claim that every possible defect is absent.

## Findings and disposition

| Priority | Finding | Disposition |
| --- | --- | --- |
| High, interpretation | Graph connectivity and an open sightline were insufficient grounds for a real corridor-barrier recommendation. Door-discharge conflicts, bases and cane detection are absent. | Installation recommendation withdrawn; experimental layouts and historical results retained. Explicit physical review appears with configurations. See `research/placement-review.md`. |
| High, interpretation | A destination-name broadcast assumes recipients can navigate to that exit; independently updated signs and fixed managers can conflict in reality. | Documented as an unvalidated physical-controller/comprehension assumption. No claim that the 16-strip network is an installation plan. The model's priority rule is not presented as real message coordination. |
| Medium, corrected | Switching LED mode replaced the existing layout with the four-strip factory layout, silently losing study/custom positions and parameters. | Mode now changes only `dynamic` on existing installations. Browser regression checks all 16 strips are retained. |
| Medium, corrected | Duplicate/reserved installation IDs correlate independent notice streams or suppress noticing; duplicated belt slots apply geometry changes twice. | Input validation rejects these cases, invalid exit identifiers/directions, malformed collections and invalid dimension/orientation values. |
| Medium, corrected | A strip could be placed on one walkway while its controller evaluated routes from an unrelated node/floor. | Strip controller must be an endpoint of its public walkway; row strips rejected. This validates the abstraction, not a physical arrow. |
| Medium, interpretation | “Familiarity” was easily confused with building knowledge; the lecture preset changes several factors at once. | Separate UI controls and three controlled information presets; legacy preset explicitly labelled as bundled assumptions. No unsupported student-speed advantage added. |
| Low, corrected | Browser worker accepted nonpositive/noninteger batch counts, producing empty misleading aggregates. | Worker now rejects invalid counts and unsafe seed ranges. |

## Unresolved model limits

Finite-lane returns, whole-family lane assignment, wheelchair exclusivity on narrow passages, body-averaged storage, discrete queue timing and the reported 19.1 s refinement difference remain influential approximations. Replacing them with contact dynamics would be a new model, not a review patch. Seated release order, group destination following, metric geometry and every-person full route knowledge for a known exit remain declared assumptions.

Visibility is 2.5D wall/column ray testing, with no crowd or smoke occlusion. Open barriers have no height/base/contact model. Staff are information sources with no body footprint. External stairs lack crowd spillback, and assistance teams have no spatial relocation cost. These limitations prevent physical certification and can affect both placement rankings and the 180 s endpoint. Demographics, response tails and LED probabilities have not been calibrated to Bailey.

The exploratory `experiments` command previously overwrote historical conventional filenames. It now requires a fresh output directory (`--out-dir`, default `results/experiment-sweep`) and refuses an existing one before spawning workers. A sentinel-file regression verifies evidence is preserved. The confirmatory study runner refuses to overwrite output, archives source, checks fixed configuration/audience hashes and retains censored runs. Its strict source/version audit is deliberately not weakened by this patch.

## Version and validation policy

Engine **1.3.1** changes input validation and the reported version only. The movement, response, routing, guidance and service algorithms are unchanged for previously valid scenarios. Historical 500-run results remain **1.3.0** results; they were not relabelled or rerun as a new study. `scripts/review-replays.ts` compares the entire first-seed result for each of the five policies, normalizing only the explicitly recorded engine-version field. This is five full replay checks, not a new 500-run experiment. The archived source remains available for an exact historical-version audit.

Executed commands and actual outcomes are recorded in `results/review/checks.json` and `results/review/replays.json`. New regression tests cover malformed inputs, installation identity and location, physical-review findings, separation of knowledge/preference, and preserving LED layouts when switching mode. Existing physical, deterministic, browser and numerical tests are retained.
