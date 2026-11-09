# Development history and retained pilot evidence

These are exploratory development runs, not independent validation. Outcomes across different source fingerprints must not be interpreted as intervention effects. All source changes precede confirmatory seeds 5001–5100. Engine corrections address observed network artifacts, not audience or service-parameter calibration.

| Stage | Version | Runs | Source SHA-256 |
| --- | --- | ---: | --- |
| intervention-pilot | 1.1.0 | 33 | `b364cc6da1beaaeddafd9a3818dc8588bb2903c4df72a979438cd352202f08d5` |
| intervention-pilot-current-state | 1.1.0 | 33 | `25e6d5ccb4ad528f76db16311f10bd4bd76063f16da350aafa4f3142be8dcbdb` |
| intervention-expanded-pilot | 1.1.0 | 60 | `f86f427bb151bc4719fcebc9cd569f63f11fd694ac472dd4e991789e671043a2` |
| intervention-final-pilot | 1.2.0 | 80 | `0b9f0de86766ee55bcabee5d4e830a2ad49531bfac954cf70075ffe630b89196` |
| intervention-selection-pilot | 1.3.0 | 80 | `610e6dbeb123b0bc8879e64a04b10e2f73860a11177cb64b95080e2d326d823e` |

## intervention-pilot

Rear-stair and gate-face repairs; before current-state commitment.

| Policy | Runs | Unresolved | All-run mean (s) | Completed-only mean (s) |
| --- | ---: | ---: | ---: | ---: |
| baseline | 3 | 0 | 213.70 | 213.70 |
| coordinated | 3 | 0 | 243.60 | 243.60 |
| barriers-only | 3 | 0 | 278.23 | 278.23 |
| partial-barriers | 3 | 0 | 249.57 | 249.57 |
| led-only | 3 | 0 | 244.53 | 244.53 |
| combined | 3 | 1 | — | 298.80 |
| combined-partial | 3 | 0 | 256.20 | 256.20 |
| dynamic-combined | 3 | 0 | 264.17 | 264.17 |
| eight-managers | 3 | 1 | — | 359.55 |
| eight-combined | 3 | 0 | 353.13 | 353.13 |
| ten-combined | 3 | 1 | — | 356.90 |

[Protocol, configurations and all run logs](../../results/intervention-pilot/).

## intervention-pilot-current-state

Added current-state instruction acceptance and final-exit commitment.

| Policy | Runs | Unresolved | All-run mean (s) | Completed-only mean (s) |
| --- | ---: | ---: | ---: | ---: |
| baseline | 3 | 0 | 197.93 | 197.93 |
| coordinated | 3 | 0 | 190.40 | 190.40 |
| barriers-only | 3 | 0 | 206.37 | 206.37 |
| partial-barriers | 3 | 0 | 207.27 | 207.27 |
| led-only | 3 | 0 | 181.90 | 181.90 |
| combined | 3 | 0 | 186.40 | 186.40 |
| combined-partial | 3 | 0 | 175.00 | 175.00 |
| dynamic-combined | 3 | 0 | 170.17 | 170.17 |
| eight-managers | 3 | 0 | 181.83 | 181.83 |
| eight-combined | 3 | 0 | 186.00 | 186.00 |
| ten-combined | 3 | 0 | 187.50 | 187.50 |

[Protocol, configurations and all run logs](../../results/intervention-pilot-current-state/).

## intervention-expanded-pilot

Expanded dynamic-layout screening; stalled seeds exposed cross-aisle discontinuity.

| Policy | Runs | Unresolved | All-run mean (s) | Completed-only mean (s) |
| --- | ---: | ---: | ---: | ---: |
| dynamic-only | 20 | 3 | — | 168.35 |
| dynamic-partial | 20 | 2 | — | 170.23 |
| dynamic-combined | 20 | 1 | — | 175.40 |

[Protocol, configurations and all run logs](../../results/intervention-expanded-pilot/).

## intervention-final-pilot

Continuous stepped cross-aisle lanes; a separate regression exposed drain-admission blocking.

| Policy | Runs | Unresolved | All-run mean (s) | Completed-only mean (s) |
| --- | ---: | ---: | ---: | ---: |
| baseline | 20 | 0 | 194.89 | 194.89 |
| dynamic-only | 20 | 0 | 167.19 | 167.19 |
| dynamic-partial | 20 | 0 | 167.19 | 167.19 |
| dynamic-combined | 20 | 0 | 173.83 | 173.83 |

[Protocol, configurations and all run logs](../../results/intervention-final-pilot/).

## intervention-selection-pilot

Final engine 1.3.0: draining continuations corrected; frozen-policy selection.

| Policy | Runs | Unresolved | All-run mean (s) | Completed-only mean (s) |
| --- | ---: | ---: | ---: | ---: |
| baseline | 20 | 0 | 192.46 | 192.46 |
| dynamic-only | 20 | 0 | 166.87 | 166.87 |
| dynamic-partial | 20 | 0 | 166.38 | 166.38 |
| dynamic-combined | 20 | 0 | 171.38 | 171.38 |

[Protocol, configurations and all run logs](../../results/intervention-selection-pilot/).

The last pilot favored dynamic LEDs with or without partial belts. The partial layout retained an open bypass and was selected for the combined-policy evaluation before the independent study. Full partitions were slower in that pilot and remain exploratory evidence. No claim of barrier benefit is inferred from a small difference in pilot means.
