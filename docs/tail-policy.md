# Nearest-time guidance and final-occupant commitment — engine 1.4.0

This is a user-requested behavioural scenario revision, not a literature-calibrated correction or a way to guarantee 180 seconds. The development branch is now `bailey-hall-simulator` (formerly `rebuild-from-scratch`) in the personal `la-38606/CMCM-Bailey-Hall` repository. Earlier results and source archives retain their historical branch/version labels.

## Emergency manager messages

The initial nearest-time candidate is preserved in `scenarios/managers/current-nearest.json`. In that candidate, CM1–CM4, the four lower-floor managers formerly assigned west/east porticoes, broadcast `nearest-time`: “use the nearest exit by estimated travel time.” CM5 and CM6 retain their balcony messages. There are still six managers, with unchanged locations, hearing, activation and compliance distributions. The subsequent [400-run policy comparison](manager-policy-study.md) selected nearest-time instructions from **all six**; `scenarios/emergency.json` and the UI/CLI defaults now use that selected policy.

The message is a common rule, not a different public destination for each listener. A person who hears and accepts it selects the fastest **known, reachable, accessible** exit from their current next reachable junction. They still finish the current link. The score is the existing sum of link travel times and currently visible gate queues divided by their service capacities. No foyer preference or persistent random taste is added to the ranking for this instruction. An unseen queue is unknown, not remotely measured. The instruction does not teach all unknown exits. Existing 8-second switching inertia and commitment to an exterior crossing still apply to ordinary instructions. Tie-breaking is by exit identifier for reproducibility.

## Final forty rule

The emergency scenario explicitly enables:

```json
"tailFallback": { "remaining": 40, "stalledSeconds": 10 }
```

The threshold counts all occupants who have not crossed the exterior boundary, anywhere in Bailey Hall. It includes wheelchair users still inside, but excludes people already outside awaiting assisted descent. The rule is per person; one stalled individual does not force other people who are still moving to change their destinations.

The final phase begins when the count first reaches 40 or fewer. A person becomes eligible after **strictly more than 10 continuous seconds without physical progress during that phase**. In this queue-network model, that means they have finished their current link and remain in its discharge queue. The timer begins at the later of the phase start and their current queue-arrival time. Moving along a new link resets it. Recognition, preparation and initial companion/seat waits are not classified as a locomotion stall. A person already on an exterior-crossing link continues outside.

At eligibility, the person chooses the minimum remaining travel-time route among their known feasible exits using a fresh, shared pre-decision queue snapshot and the existing visibility rules. Queues are counted from the occupants currently waiting behind each lane's head for its requested next link; these are network queue counts, not a continuous crowd-position model. Width, accessibility, learned closures and the existing return-lane rule remain enforced. All qualifying people use the same snapshot in that tick. The decision ignores foyer bias, random taste, companion destinations, previous accepted guidance and the ordinary 8-second switching margin.

The entire selected route and exit are then locked. No later manager/sign message, companion destination or changed queue estimate alters them; walking and ordinary gate/receiving-storage service continue. A `tail-final-commitment` event records the trigger time, remaining count, stall duration, decision junction, exit, estimated time, alternatives and exact route. The inspector marks the final choice as locked.

No feasible known exit means no invented route. A subsequently encountered obstruction still cannot be crossed; with the requested permanent lock the person may remain unresolved. The rule cannot solve every physical gridlock, and it does not delete people, increase capacity, skip queues, resample their traits or erase response tails. The numerical 40/10 thresholds and withdrawal from subsequent guidance are explicit user assumptions, not observed Bailey behaviour.

## Configuration and historical evidence

The checkbox under **Final occupants** enables this optional rule for any selected scenario. Omission of `tailFallback` disables it, so saved historical scenarios and the 500-run LED/barrier study retain their original behaviour. `reference()` remains the historical study reference; `emergency()` constructs the revised default. `scenarios/review/nearest-time-no-tail.json` provides an otherwise identical comparison with the new manager messages and no final-occupant rule.

The new version's paired validation experiment uses ten seeds, 5001–5010, with the same audience across enabled/disabled arms. This is a regression-sized experiment, not a replacement 100-replication confirmatory study. Results and checks are recorded separately under `results/tail-policy/`; earlier results are not relabelled as 1.4.0 evidence.

## Executed validation

Both arms cleared all 1,329 people in all ten runs. With and without the final-occupant rule, mean full-house clearance was **182.5 s**, with **3/10** runs at or below 180 s. Each paired clearance was identical; the rule triggered 90 final commitments across the enabled arm. All 90 retained an exit already minimizing their current estimated time. This sample supplies no clearance benefit from the fallback, and neither configuration's mean is below 180 s. No parameter was adjusted in response to that outcome.

The general suite passed 77 tests before two additional queue-snapshot/obstruction tests were added; the final targeted file passed all 13 tests. Together these cover **79 distinct passing tests**. Six Chrome tests and the TypeScript/production build passed. Boundary timing was tested at both 0.1 s and 0.0125 s; this is not a new full-network convergence claim. Both ten-run archive sets passed hash/event audits and exact first-seed replay.

The policy audit verifies every committed path, absence of later guidance/route updates, paired audience identity and the smallest recorded time choice. Full-result comparisons with all five historical first-seed policies normalize only the version field. [Machine-readable evidence](../results/tail-policy/policy-audit.json), [check record](../results/tail-policy/checks.json), and full compressed logs are retained.

Reproduce in fresh output directories:

```sh
npm run monte-carlo -- --config scenarios/managers/current-nearest.json --seed 5001 --runs 10 --jobs 2 --out results/tail-repeat-with
npm run monte-carlo -- --config scenarios/review/nearest-time-no-tail.json --seed 5001 --runs 10 --jobs 2 --out results/tail-repeat-without
node --import tsx scripts/audit-monte-carlo.ts --out results/tail-repeat-with
node --import tsx scripts/audit-monte-carlo.ts --out results/tail-repeat-without
```

`node --import tsx scripts/audit-tail-policy.ts` audits the preserved `results/tail-policy` records and replays the five historical policies. The engine/source archive alongside those records preserves this revision.
