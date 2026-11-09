# Lecture students, regular attendees and unfamiliar visitors

There is no hard-coded “student” or “tourist” movement class. The model separates information, preference, demographics, response and staffing. This matters because being a student does not guarantee familiarity with a particular room.

| Mechanism | Configuration / occupant state | Meaning |
| --- | --- | --- |
| Initial exit knowledge | `knowledge` → `Person.known` | The foyer is initially known. Each other exit eligible for that seating level is independently included with probability `knowledge`, using a fixed seed/person/exit draw. This is knowledge of routes, not current remote queues or closures. |
| Entrance preference | `familiarityShare` → `Person.familiarity` | A sampled share receives a persistent 12-second utility preference for the foyer. The legacy field name means **foyer preference**, not knowing the building well. |
| Individual preferences | `Person.taste[exit]` | Persistent Gumbel utility terms, scale 4 s, remain stable across reviews. |
| Learning | `known`, `blocked`, accepted guidance | Visible signs and heard staff can add an exit; legitimate observation/reports reveal closures. There is no omniscient knowledge of remote queues. |
| Age and mobility | `olderShare`, speeds and stair ratios | Independent assumptions; familiarity does not change walking speed. Three wheelchair users remain included. |
| Recognition/preparation | `recognitionMedian`, `responseMedian`, `logSD` | Independent assumptions; knowing exits does not erase response delays. |
| Staffing | `managers` | The brief assumes no managers during lectures and six minimum for the full concert. |

The **legacy lecture preset** combines `knowledge=1`, `familiarityShare=0`, no managers, 10% older share, and recognition/preparation medians of 3/8 s. The concert reference uses `knowledge=1`, 35% foyer preference, six managers, 20% older share and 6/14 s medians. Both know all eligible exits initially. A clearance difference between those presets is therefore not an isolated effect of familiarity; the faster response and age choices are uncalibrated assumptions. Existing results retain that definition for reproducibility.

The brief explicitly assumes regular lecture students know the emergency exits. That supports full initial knowledge in its lecture case; it does not establish zero entrance bias, universally prompt response or an exact age distribution. [Tong et al. (2025)](https://www.research.ed.ac.uk/en/publications/exploring-occupant-exit-choices-during-fire-drills-and-false-alar/) found context-dependent exit choices in a university library, including familiar-route and staff effects. It does not supply a Bailey-specific student/unfamiliar probability or response time.

Three new **controlled information presets** keep demographics, speeds, response distributions, groups, compliance and staffing identical (no managers). They vary:

| Preset in `scenarios/review/` | Knowledge | Foyer-preference share | Comparison |
| --- | ---: | ---: | --- |
| `information-full.json` | 1.0 | 0.35 | Full-information control |
| `information-limited.json` | 0.5 | 0.35 | Less initial exit knowledge only |
| `information-no-bias.json` | 1.0 | 0.0 | No foyer preference only |

The 0.5 knowledge value is an illustrative sensitivity, not a measured unfamiliar-visitor rate. For an unfamiliar-person example, use a smaller initial known-exit set while keeping walking/response assumptions separate. For a regular-student example, use the brief's full knowledge, then vary foyer bias independently. The controls now expose both probabilities explicitly. The same seed holds other traits fixed across these comparisons; tests verify that property.

A remaining simplification is important: knowing an exit identifier currently implies being able to route through the reconstructed graph to it. The model does not represent incomplete cognitive maps, wandering, or interpretation of each successive directional arrow. That optimistic assumption limits claims about unfamiliar visitors and LED effectiveness. The information presets are supplied and tested, but no new lecture-vs-visitor Monte Carlo outcome is asserted in this review.
