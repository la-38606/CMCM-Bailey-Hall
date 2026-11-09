"""Audit paired policy summaries and report the fixed 100-replication comparison.
Full archive/hash/replay audits are performed separately by audit-monte-carlo.ts.
Usage: python3 scripts/report-manager-policies.py [study-directory]
"""
import functools
import hashlib
import itertools
import json
import math
import pathlib
import statistics
import sys
from study_statistics import describe

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / (sys.argv[1] if len(sys.argv) > 1 else 'results/manager-policy-study')
D = json.loads((OUT / 'design.json').read_text())
NAMES = D['policies']
COUNT = D['replicationsPerPolicy']
LABELS = {
    'current-nearest': 'Nearest-time lower floor; original balcony exits',
    'nearest-all': 'Nearest-time from all six managers',
    'coordinated': 'Fixed coordinated destinations',
    'nearest-foyer-balcony': 'Nearest-time lower floor; foyer from balcony',
}

@functools.lru_cache(maxsize=None)
def t_critical(df, probability):
    if df < 1 or not .5 < probability < 1:
        raise ValueError('Invalid t quantile')
    scale = math.exp(math.lgamma((df + 1) / 2) - math.lgamma(df / 2)) / math.sqrt(df * math.pi)
    def cdf(x):
        panels = 2000
        h = x / panels
        def density(y): return scale * (1 + y * y / df) ** (-(df + 1) / 2)
        total = density(0) + density(x)
        total += sum((4 if i % 2 else 2) * density(i * h) for i in range(1, panels))
        return .5 + h * total / 3
    lo, hi = 0., 32.
    for _ in range(48):
        mid = (lo + hi) / 2
        if cdf(mid) < probability: lo = mid
        else: hi = mid
    return (lo + hi) / 2

# Known reference quantile; protects a reporting calculation rather than engine behaviour.
assert abs(t_critical(99, .975) - 1.9842169515) < 1e-7
records, summaries, configs = {}, {}, {}
for name in NAMES:
    records[name] = json.loads((OUT/name/'replications.json').read_text())
    summaries[name] = json.loads((OUT/name/'summary.json').read_text())
    configs[name] = json.loads((OUT/name/'config.json').read_text())
    protocol = json.loads((OUT/name/'protocol.json').read_text())
    assert protocol['configHash'] == D['policyHashes'][name]
    assert protocol['engineVersion'] == D['engineVersion']
    assert len(records[name]) == COUNT
    assert [r['seed'] for r in records[name]] == list(range(D['firstSeed'], D['firstSeed'] + COUNT))
    assert len({r['audienceHash'] for r in records[name]}) == COUNT
    assert all(r['configHash'] == protocol['configHash'] for r in records[name])
    assert not configs[name]['signs'] and not configs[name]['barriers']
    assert configs[name]['tailFallback'] == {'remaining':40, 'stalledSeconds':10}

base = configs[NAMES[0]]
for name in NAMES:
    assert {k:v for k,v in configs[name].items() if k not in ['name','managers']} == {k:v for k,v in base.items() if k not in ['name','managers']}
    assert [{k:v for k,v in m.items() if k != 'exit'} for m in configs[name]['managers']] == [{k:v for k,v in m.items() if k != 'exit'} for m in base['managers']]
    assert [r['audienceHash'] for r in records[name]] == [r['audienceHash'] for r in records[NAMES[0]]]
    assert [r['managerActivations'] for r in records[name]] == [r['managerActivations'] for r in records[NAMES[0]]]

means = {name:describe([r['clearance'] for r in records[name] if r['clearance'] is not None]) for name in NAMES}
contrasts = {}
family = math.comb(len(NAMES), 2)
for a,b in itertools.combinations(NAMES, 2):
    values = [ra['clearance']-rb['clearance'] for ra,rb in zip(records[a],records[b]) if ra['clearance'] is not None and rb['clearance'] is not None]
    v = describe(values)
    margin = t_critical(len(values)-1, 1-.05/(2*family)) * v['sd']/math.sqrt(len(values)) if len(values)>1 else None
    v['familywise95'] = [v['mean']-margin, v['mean']+margin] if margin is not None else None
    v['conditionalOnCompletePairs'] = len(values) != COUNT
    contrasts[f'{a} minus {b}'] = v

def comparison(a,b):
    if a==b: return {'mean':0,'familywise95':[0,0]}
    key=f'{a} minus {b}'
    if key in contrasts: return contrasts[key]
    v=contrasts[f'{b} minus {a}']
    return {**v,'mean':-v['mean'],'familywise95':[-v['familywise95'][1],-v['familywise95'][0]] if v['familywise95'] else None}

complete = [n for n in NAMES if summaries[n]['unresolved']==0]
selected = min(complete, key=lambda n:means[n]['mean']) if complete else None
reason = 'Lowest observed unconditional mean among fully completed policies.'
if selected and selected != 'coordinated' and 'coordinated' in complete:
    ci=comparison('coordinated',selected)['familywise95']
    if ci and ci[0] <= 0 <= ci[1]:
        selected='coordinated'
        reason='No clear adjusted paired difference from the lowest-mean policy; prefer the simpler fixed coordinated messages, as specified before the experiment.'
if not selected: reason='No policy completed every run; no unconditional mean winner is selected.'

analysis={'engineVersion':D['engineVersion'],'firstSeed':D['firstSeed'],'count':COUNT,
 'pairedAudienceHashesVerified':True,'fixedParametersAndManagerActivationsVerified':True,
 'means':means,'pairedContrasts':contrasts,'selectedPolicy':selected,'selectionReason':reason,
 'pairwiseMethod':f'Paired Student t; six nominal intervals and Bonferroni simultaneous 95% intervals for {family} prespecified pairwise contrasts.',
 'limitation':'Policy selection uses these samples; this is not independent confirmation of a globally optimal policy.'}
(OUT/'analysis.json').write_text(json.dumps(analysis,indent=2)+'\n')

def f(x): return '—' if x is None else f'{x:.1f}'
def ci(v): return '—' if not v else f'{v[0]:.1f} to {v[1]:.1f}'
lines=['# Crowd Manager message-policy Monte Carlo comparison','',
 f"Engine {D['engineVersion']}; {len(NAMES)} policies × {COUNT} replications, seeds {D['firstSeed']}–{D['firstSeed']+COUNT-1}.",'',
 f"**Selected policy: {LABELS[selected] if selected else 'none'}.** {reason}",'',
 'Six staff posts, 1,329 audience members, physical parameters, age/response distributions and compliance are held fixed. No added LEDs or barriers are used. Every policy enables the same final-40/10-second rule. Only the public manager messages differ. Fresh audiences are sampled across seeds and paired identically across policies.','',
 '| Policy | Completed | Mean (s) | SD (s) | 95% CI for mean (s) | ≤180 s | p95 (s) |',
 '| --- | ---: | ---: | ---: | ---: | ---: | ---: |']
for n in NAMES:
    s=summaries[n];m=means[n]
    lines.append(f"| {LABELS[n]} | {s['resolved']}/{COUNT} | {f(s['mean'])} | {f(m['sd']) if not s['unresolved'] else 'conditional'} | {ci(m['ci95']) if not s['unresolved'] else 'not estimable'} | {s['successes']}/{COUNT} | {f(s['completedOnlyQuantiles']['p95'])} |")
lines += ['', 'Censored runs remain in the success denominator and prevent an unconditional mean. Quantiles are completed-only if any run is censored. Mean intervals describe sampling variation under this fixed model, not uncertainty in geometry or behaviour.','',
 '## Paired comparisons','', '| Difference (negative is faster) | Mean (s) | Nominal 95% interval | Simultaneous 95% interval |', '| --- | ---: | ---: | ---: |']
for k,v in contrasts.items():
    a,b=k.split(' minus ')
    lines.append(f"| {LABELS[a]} minus {LABELS[b]} | {f(v['mean'])} | {ci(v['ci95'])} | {ci(v['familywise95'])} |")
lines += ['', f'The simultaneous intervals use Bonferroni correction across all {family} candidate contrasts. If either member is censored, that pair is omitted and the contrast is explicitly conditional. Selecting a policy from this comparison is not an independent validation of the selected minimum.','', '## Selected instructions','', '| Manager | Model post | Instruction |', '| --- | --- | --- |']
if selected:
    for m in configs[selected]['managers']:
        lines.append(f"| {m['id']} | `{m['node']}` | {'Nearest known reachable exit by estimated travel time' if m['exit']=='nearest-time' else m['exit'].replace('-',' ')} |")
lines += ['', '## Real-world interpretation','',
 'These are simulated message assignments, not surveyed standing positions or an approved emergency procedure. Staff must stand clear of doorway swings and moving queues. A foyer instruction on the balcony means the appropriate rear stair route, not a direct level path; staff wording and any existing signs must be consistent. Do not add corridor belts on the basis of this study. The earlier placement review remains applicable.','',
 'A nearest-time instruction requires each listener to interpret a generic rule using known routes and visible queues; it does not validate human estimates of remaining travel time. Fixed destination assignments are easier to turn into a common public message, but their actual audibility, comprehension and route access still need venue review. No staff-body obstruction, smoke or external landing spillback is represented. The final-occupant rule is a user assumption, not empirical calibration.','',
 '## Evidence and reproducibility','',
 'The design and configuration hashes were saved before the runs. Each policy directory retains full compressed event logs, per-run CSV/JSON, fixed configuration, source fingerprint and hash/replay audit. Paired audience hashes and identical staff activation times are checked before generating this report. The archived engine source preserves the evaluated implementation.','',
 '[Frozen design](../results/manager-policy-study/design.json) · [Analysis](../results/manager-policy-study/analysis.json) · [Physical placement review](research/placement-review.md)','']
(ROOT/'docs/manager-policy-study.md').write_text('\n'.join(lines))
print(json.dumps({'selected':selected,'reason':reason,'means':means,'contrasts':contrasts},indent=2))
