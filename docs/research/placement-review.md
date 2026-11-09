# Practical placement and literature review

Reviewed 9 November 2026 against all supplied plans, seating diagrams, cross-aisle enlargements and photographs, the preserved experiment, and the primary sources below. This is a desk review, not a site inspection or installation approval.

## Decision

**Do not install the tested corridor belts or full partitions on the strength of this model.** The model found no clear incremental belt benefit: adding partial belts to LEDs changed mean clearance by +0.54 s (paired 95% interval −0.42 to +1.50 s). The nominal 1.9 m bypass excludes post bases, door swings, people turning out of doorways and contact with the device. An open belt preserves views but is still an obstacle.

Cornell EHS's current [event setup guidance](https://ehs.cornell.edu/campus-health-safety/event-management/event-setup) calls for unobstructed exit routes and fully operable doors. The model's 1.1 m bypass screen cannot establish compliance with that guidance or the building's required egress widths. The [Access Board's protruding-object provisions](https://www.access-board.gov/ada/#ada-307) also address objects between posts and cane detection; clear wheelchair connectivity alone does not establish accessibility. We have no measured belt height, base footprint or mounting design to assess those issues.

**Prioritize review of clear, consistent staff instructions and supplementary directional signage.** The 172.0 s LED-only mean is conditional on this model, not a demonstrated real-world outcome. No device has an approved construction coordinate in this repository. The 16 strips are experimental locations on inferred walkways. An actual installation would need a verified local arrow at each decision, continuity through subsequent turns to a usable exterior exit, and a coordinated staff/voice message plan. Keep the existing approved exit signs and illumination; the study does not validate replacing them.

## Placement-specific findings

| Model locations | What the references support | What the model misses / disposition |
| --- | --- | --- |
| Belts on `corridor-3` and `corridor-8` | Both lie on the outer circulation route receiving auditorium discharge. Each segment shares a junction with an auditorium door. | Their midpoint placement is not proof of separation from the door swing or merging crowd. Reject these as installation recommendations. Full-span variants additionally remove cross-corridor route choice and redundancy. |
| ZLED1–6, mezzanine `m1,m3,m5,m7,m9,m11` | Raised rear/side circulation feeds the nine auditorium doors. Photographs show visible doors, a parapet, seating and level changes. | A floor strip need not be visible from seats or beyond standing people. Verify the local doorway arrow, preserve row discharge and step contrast, and keep mounting outside usable width. Conditional signage candidates only. |
| ZLED7–10, balcony `b1,b4,b7,b10` | Plans show front escape routes and two rear stair approaches; columns interrupt the rear circulation. | Verify arrows at the actual stair doors and turns, including landings. Do not imply a level wheelchair route. Column, parapet and crowd occlusion need a walkthrough. |
| ZLED11–14, outer corridor `c1,c4,c7,c10` | Corridor bends, portico doors and foyer doors create real route decisions. | An exit-group label is not a left/right/straight instruction. Survey sightlines from both approach directions, door swings, mounting, and continuity to the exterior. |
| ZLED15–16, front orchestra `oL0,oR0` | The supplied first-floor plan labels stage escape routes. | The graph abbreviates the complete side passage and exterior connection. Confirm audience access, door operation and performance-stage restrictions before any directional device is proposed. |
| CM2/CM3 at `m4,m8`; CM5/CM6 at `b4,b8` | Rear decision areas can direct people toward the foyer route and rear balcony stairs. | Posts are points, not staff-body footprints. A real post must be outside the moving line and doorway sweep; verify speech audibility and coordination with signs. |
| Stepped cross-aisles | The enlargements distinguish the public stepped connector from seat rows. | No belt is proposed here. Avoid hardware on tread edges or handrails; any route indication must preserve step recognition and accessible alternatives. |

## Literature and transfer limits

Galea et al.'s [station trial](https://gala.gre.ac.uk/id/eprint/16552/) supports coordinated active signs and non-conflicting voice messages. It does not validate these 16 strip positions, the 8 m range, or personalized destination instructions. The existing 0.77 detection and 0.80 acceptance are model transfer assumptions. Independent person–installation draws can exaggerate the benefit of many exposures when real attention is correlated; repeated exposure to the same installation does not redraw its tendency.

[Wang et al., Table 2](https://arxiv.org/html/2212.01296v1) reports barriers worsening its measured time by 2.67% at 1 m and 0.88% at 3 m; the abstract swaps that ordering. Three repetitions were averaged after excluding five initial and five final people. This is neither a universal barrier benefit nor the full-house maximum used here. No empirical percentage multiplier enters the engine.

The original source review also considers obstacle and guardrail studies with different geometries. Their configurations cannot establish the effects of these side-anchored belts in a curved corridor. Visibility preservation alone is insufficient to transfer their results.

## Controller limitations that matter in the hall

The simulation broadcasts an exit-group name. A recipient who learns that name can calculate a path through the known graph; the engine does not simulate reading a sequence of local arrows. It can therefore overstate what one strip tells an unfamiliar visitor. A strip's controller node is now required to belong to the installed walkway, but this consistency check is not an arrow-design validation.

Dynamic messages use delayed reports and a hold time, yet individual signs are optimized independently. Nearby signs can recommend different exits, and fixed managers may disagree. Giving managers software priority prevents an internal tie; it does not prevent a person from seeing contradictory instructions. Before a physical dynamic-sign pilot, validate a single coherent message plan, downstream arrow continuity, accessible alternatives, stale-report behavior, power loss, and a fallback to the venue's approved static guidance. Those hardware and hazard-control functions are not implemented or claimed.

A geometry pass means only the declared network is traversable. It does not test smoke, tenability, structural fire separation, external landing queues, hardware reliability or staff accessibility procedures. A venue survey and supervised comprehension/walkthrough exercise would be needed before a field pilot. This review provides no instruction to install equipment or alter the hall's existing emergency plan.
