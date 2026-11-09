# Bailey Hall: 100-replication Monte Carlo experiment

Ran **100 independent seeded replications** of **Six-manager concert emergency**, seeds **1001–1100**. Each run contains 1,329 occupants, including three wheelchair users. Scenario parameters and the engine were held fixed. No parameter was tuned against the 180-second target.

## Evacuation results

The primary endpoint is the last occupant crossing the building exterior boundary. Street arrival, including assisted descent, is a separate supplementary endpoint. All times are seconds after the simulation starts.

| Metric | Result |
| --- | ---: |
| Replications reaching full exterior clearance | 85/100 |
| Unresolved at 900 seconds | 15/100 |
| Full clearance within 180 seconds | 0/100 (0.0%) |
| 95% Wilson interval for probability of clearance within 180 seconds | 0.00%–3.70% |
| Completed runs: mean ± sample SD | 215.1 ± 10.3 s |
| Completed runs: median | 213.0 s |
| Completed runs: 5th–95th percentile | 203.8–235.9 s |
| Completed runs: minimum–maximum | 200.3–251.8 s |
| Mean of min(clearance time, 900 s), all 100 runs | 317.8 s |
| Mean occupants outside at 180 s | 1214.9/1329 (91.41%) |
| Occupants outside at 180 s: range | 1166–1256 |

**The unconditional mean clearance time cannot be estimated from the completed runs alone.** The observed sample's overall mean exceeds 317.8 s because 15 clearances are only known to exceed 900 s. The completed-only statistics exclude those runs and must not be interpreted as the whole scenario's performance. The restricted mean above caps each unresolved observation at 900 s; it is not a completed evacuation time.

All-run empirical quantiles (nearest-rank, retaining censoring):

| Percentile | Clearance time |
| --- | ---: |
| p05 | 203.8 s |
| p25 | 209.1 s |
| median | 214.0 s |
| p75 | 227.7 s |
| p90 | >900 s |
| p95 | >900 s |
| p99 | >900 s |

Completed-only quantiles use linear interpolation. These quantiles describe variation between simulated audiences, not uncertainty intervals for the model parameters. The Wilson interval addresses Monte Carlo sampling uncertainty only.

## Exit use

Counts are across all 132,900 simulated occupants; occupants still inside remain in the denominator.

| Exit group | Mean occupants per replication | Total crossings | Share of all occupants |
| --- | ---: | ---: | ---: |
| foyer | 69.3 | 6,929 | 5.21% |
| west-portico | 484.9 | 48,492 | 36.49% |
| east-portico | 445.8 | 44,581 | 33.54% |
| west-stage | 22.5 | 2,247 | 1.69% |
| east-stage | 20.1 | 2,006 | 1.51% |
| northwest-balcony | 148.0 | 14,796 | 11.13% |
| northeast-balcony | 135.1 | 13,508 | 10.16% |
| Still inside at cutoff | 3.4 | 341 | 0.26% |

## Accessibility and queues

Across the 300 wheelchair-user observations, **300/300 crossed the exterior boundary** and **300/300 reached street level with assistance**. These are person observations nested within 100 replications, not 300 independent scenario trials.

| Metric | Result |
| --- | ---: |
| Wheelchair exterior crossing, observed mean / 95th percentile / maximum | 49.4 / 105.1 / 137.2 s |
| Wheelchair street arrival, observed mean / 95th percentile / maximum | 141.0 / 215.2 / 265.3 s |
| Maximum single-link queue per run, mean / maximum | 26.3 / 38.0 people |
| Mean per-person accumulated queue waiting, averaged across runs | 59.4 s |
| Full street clearance, completed runs only | n=85; mean 228.2 s |

Queue wait includes waits accumulated through the cutoff for occupants still inside. A maximum single-link queue is not the total number queued throughout the building. Ordinary street arrival uses the engine’s assumed exterior free-walking lengths; external crowd congestion is not modelled.

## Unresolved runs

| Seed | Outside at cutoff | Still inside |
| --- | ---: | ---: |
| 1022 | 1299 | 30 |
| 1023 | 1317 | 12 |
| 1033 | 1291 | 38 |
| 1035 | 1317 | 12 |
| 1037 | 1317 | 12 |
| 1041 | 1292 | 37 |
| 1043 | 1295 | 34 |
| 1053 | 1310 | 19 |
| 1058 | 1306 | 23 |
| 1074 | 1304 | 25 |
| 1075 | 1295 | 34 |
| 1076 | 1314 | 15 |
| 1081 | 1297 | 32 |
| 1083 | 1321 | 8 |
| 1097 | 1319 | 10 |

## Fixed parameters and resampling

The fixed configuration is [`config.json`](../results/monte-carlo-100/config.json): six stationary Crowd Managers, no added LED installations, no barriers or closures, no advance announcement, available-lane return policy, 0.1 s integration step and 900 s cutoff. Walking-speed distribution: mean 1.4 m/s and SD 0.18 m/s before age adjustments and clipping; older share 20%; recognition/response lognormal medians 6/14 s and log SD 0.6; foyer-familiar share 35%; manager acceptance probability 85%. All other geometry and distribution conventions remain unchanged.

Every replication creates a fresh simulation and seed. Audience age, speed, body radius, recognition and response delays, social groups, preference type, exit tastes, and manager acceptance are resampled. The seed also resamples stochastic hearing, staff activation, assistance and other applicable decisions. Persistent preferences remain persistent within a replication. The fixed seating inventory and three wheelchair origins/count are scenario structure; they are not moved between replications. No new LED decisions occur because there are no added LEDs in this scenario.

| Audience audit | Range across replications |
| --- | ---: |
| Older occupants | 224–305 |
| Foyer-familiar occupants | 421–499 |
| Time-oriented occupants | 830–908 |
| Grouped occupants | 664–665 |

## Verification and reproduction

- Verified 100 archives and their SHA-256 hashes, 100 distinct initial audience hashes, and one unchanged scenario hash.
- Recomputed exterior/street counts, exit usage, clearance times and 180-second outcomes from 5,772,355 archived events.
- The simulation checks conservation, lane/storage and accessible-path invariants on every time step.
- Replayed seed 1001 in a fresh simulation; its entire RunResult matched the saved result exactly.
- `npm run typecheck` passed for the new runner and audit script.
- Engine version: `1.0.0`; source SHA-256: `2613246ab310ac3da622e5c1c1133ee814942a349ed0146c9f4e51a0ab3bb29c`.
- Batch wall time: 4.51 minutes using four worker processes.

```sh
npm run monte-carlo -- --config scenarios/emergency.json --seed 1001 --runs 100 --jobs 4 --out results/monte-carlo-repeat
node --import tsx scripts/audit-monte-carlo.ts --out results/monte-carlo-repeat
```

The runner refuses to overwrite an existing experiment directory. Worker scheduling does not affect simulation randomness.

Evidence: [per-replication CSV](../results/monte-carlo-100/replications.csv), [summary JSON](../results/monte-carlo-100/summary.json), [audit JSON](../results/monte-carlo-100/audit.json), [protocol](../results/monte-carlo-100/protocol.json), and [full compressed run archives](../results/monte-carlo-100/replications/).

## Interpretation limits

These are results of the current reconstructed queue-network model, not measurements of Bailey Hall. Inferred geometry, seat allocation, lane and reversal rules, behavioral distributions, the 0.1 s integration step and external-assistance assumptions contribute uncertainty that this fixed-parameter Monte Carlo does not quantify. Unresolved queues warrant investigation; their occurrence is a model result, not proof that the real building would gridlock. The implementation and parameters were not changed to remove them or to meet 180 seconds. See [implementation decisions](implementation-decisions.md) and [earlier numerical validation](validation.md).

## Follow-up diagnosis of delays and unfinished runs

The 100-run batch took 4.51 minutes of computer time. This differs from simulated evacuation time. Median first movement was 23.8 s and its 95th percentile was 45.9 s; these include initial behavioral and row-admission delays. Mean accumulated queue wait was 59.4 s per person. Of the 85 completed runs, the final exterior crossing was at the west portico in 56 and northwest balcony exit in 24. These observations locate the long evacuation tail but are not a causal intervention comparison.

All 15 unfinished runs retained queues at the rear balcony stairs and their approaches. Their final recorded events occurred between 212.0 and 260.2 s, despite continued integration to 900 s. Thus these are persistent simulation stalls, not people slowly walking for 15 minutes.

Fresh replays of seeds 1022 and 1023 exposed opposing occupied lanes at adjacent stair/approach segments: downward travellers cannot enter segments whose lanes are occupied upward, while upward travellers cannot enter the occupied downward segments. The lane-retention and FIFO rules prevent either side from releasing the other. In these examples, some downward travellers follow existing exit signs toward the east portico while upward travellers retain CM6 guidance toward the northeast balcony exit. The routing/lane model permits a circular blockage that it cannot resolve. The intermediate landing is represented as a junction without separate holding space. This is evidence of a model/implementation limitation; the 15% unresolved rate should not be interpreted as a real-building deadlock probability. Conservation and deterministic replay tests do not establish physical realism of this behavior.

This batch includes existing exit signs but **zero added LED installations and zero barriers**. Those features exist as configurable interventions; this Monte Carlo did not test them. Original outputs and model parameters remain unchanged. See [diagnostic snapshots](../results/monte-carlo-100/diagnostics.json).
