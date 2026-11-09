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
    while cdf(hi) < probability:
        hi *= 2
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

def quantile(values, p):
    ordered=sorted(values)
    if not ordered: return None
    x=(len(ordered)-1)*p
    i=math.floor(x)
    return ordered[i]+(ordered[min(i+1,len(ordered)-1)]-ordered[i])*(x-i)

means = {name:describe([r['clearance'] for r in records[name] if r['clearance'] is not None]) for name in NAMES}
for name in NAMES:
    values=[r['clearance'] for r in records[name] if r['clearance'] is not None]
    means[name]['median']=quantile(values,.5)
    means[name]['p95']=quantile(values,.95)
    m=means[name]
    margin=t_critical(len(values)-1,1-.05/(2*len(NAMES)))*m['sd']/math.sqrt(len(values)) if len(values)>1 else None
    m['familywiseMean95']=[m['mean']-margin,m['mean']+margin] if margin is not None else None
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
    lines.append(f"| {LABELS[n]} | {s['resolved']}/{COUNT} | {f(s['mean'])} | {f(m['sd']) if not s['unresolved'] else 'conditional'} | {ci(m['ci95']) if not s['unresolved'] else 'not estimable'} | {s['successes']}/{COUNT} | {f(m['p95'])} |")
lines += ['', '![Manager-policy distributions and means](model/figures/manager-policy-comparison.png)', '', 'Censored runs remain in the success denominator and prevent an unconditional mean. Quantiles are completed-only if any run is censored. Mean intervals describe sampling variation under this fixed model, not uncertainty in geometry or behaviour.','',
 '## Paired comparisons','', '| Difference (negative is faster) | Mean (s) | Nominal 95% interval | Simultaneous 95% interval |', '| --- | ---: | ---: | ---: |']
for k,v in contrasts.items():
    a,b=k.split(' minus ')
    lines.append(f"| {LABELS[a]} minus {LABELS[b]} | {f(v['mean'])} | {ci(v['ci95'])} | {ci(v['familywise95'])} |")
lines += ['', f'The simultaneous intervals use Bonferroni correction across all {family} candidate contrasts. If either member is censored, that pair is omitted and the contrast is explicitly conditional. Selecting a policy from this comparison is not an independent validation of the selected minimum.','', '## Selected instructions','', '| Manager | Model post | Instruction |', '| --- | --- | --- |']
if selected:
    for m in configs[selected]['managers']:
        lines.append(f"| {m['id']} | `{m['node']}` | {'Nearest known reachable exit by estimated travel time' if m['exit']=='nearest-time' else m['exit'].replace('-',' ')} |")
if selected:
    lines += ['', f"The selected mean's simultaneous 95% interval, adjusted across the four candidate means, is {ci(means[selected]['familywiseMean95'])} s. This additional interval accounts for inspecting multiple candidate means; physical and parameter uncertainties remain excluded."]
lines += ['', '## Real-world interpretation','',
 'These are simulated message assignments, not surveyed standing positions or an approved emergency procedure. Staff must stand clear of doorway swings and moving queues. A foyer instruction on the balcony means the appropriate rear stair route, not a direct level path; staff wording and any existing signs must be consistent. Do not add corridor belts on the basis of this study. The earlier placement review remains applicable.','',
 'A nearest-time instruction requires each listener to interpret a generic rule using known routes and visible queues; it does not validate human estimates of remaining travel time. Fixed destination assignments are easier to turn into a common public message, but their actual audibility, comprehension and route access still need venue review. No staff-body obstruction, smoke or external landing spillback is represented. The final-occupant rule is a user assumption, not empirical calibration.','',
 '## Evidence and reproducibility','',
 'The design and configuration hashes were saved before the runs. Each policy directory retains full compressed event logs, per-run CSV/JSON, fixed configuration, source fingerprint and hash/replay audit. Paired audience hashes and identical staff activation times are checked before generating this report. The archived engine source preserves the evaluated implementation.','',
 '[Frozen design](../results/manager-policy-study/design.json) · [Analysis](../results/manager-policy-study/analysis.json) · [Physical placement review](research/placement-review.md)','']
(ROOT/'docs/manager-policy-study.md').write_text('\n'.join(lines))
print(json.dumps({'selected':selected,'reason':reason,'means':means,'contrasts':contrasts},indent=2))
tex=[r'\section{Crowd Manager Message-Policy Selection}\label{sec:manager-selection}',
 f"A separate engine {D['engineVersion']} experiment compared four message policies on {COUNT} fresh audiences each (seeds {D['firstSeed']}--{D['firstSeed']+COUNT-1}). The six posts, activation and compliance draws, audience and physical parameters, and final-forty rule were identical across policies. No added LEDs or barriers were used. Only manager messages differed. Candidate configurations and selection criteria were recorded before completion of the experiment; no parameter was fitted to the results.",
 r'\begin{table}[htbp]\centering\small',r'\begin{tabularx}{\linewidth}{Xrrrr}\toprule',
 r'Policy & Complete & Mean (s) & 95\% interval (s) & $\leq180$ s\\\midrule']
for n in NAMES:
 s=summaries[n];m=means[n]
 interval=f"{m['ci95'][0]:.1f}--{m['ci95'][1]:.1f}" if not s['unresolved'] else 'not estimable'
 tex.append(f"{LABELS[n]} & {s['resolved']}/{COUNT} & {f(s['mean'])} & {interval} & {s['successes']}/{COUNT}"+r'\\')
tex += [r'\bottomrule\end{tabularx}',r'\caption{Fixed-policy comparison. Mean intervals quantify Monte Carlo sampling uncertainty, not physical or behavioural uncertainty.}\end{table}',
 r'\begin{figure}[htbp]\centering\includegraphics[width=\linewidth]{figures/manager-policy-comparison.pdf}',
 r'\caption{Empirical clearance distributions and nominal mean intervals for four manager policies. Dashed lines mark 180 seconds.}\end{figure}',
 f"The selected candidate is \\textbf{{{LABELS[selected] if selected else 'none'}}}. {reason}"]
if selected:
 mean_ci=means[selected]['familywiseMean95']
 tex.append(f"The selected mean's simultaneous 95\\% interval, adjusted over the four candidate means, is {mean_ci[0]:.2f} to {mean_ci[1]:.2f} s. This accounts for inspecting several means, but not physical or parameter uncertainty.")
 ref='current-nearest'
 v=comparison(selected,ref)
 if selected != ref:
  tex.append(f"Relative to the requested lower-floor nearest-time policy with the original balcony exits, the selected policy's paired mean change is {v['mean']:.2f} s. Its simultaneous 95\\% interval is {v['familywise95'][0]:.2f} to {v['familywise95'][1]:.2f} s.")
 tex += [r'\begin{table}[htbp]\centering\small',r'\begin{tabularx}{\linewidth}{llX}\toprule',r'Manager & Post & Public instruction\\\midrule']
 for m in configs[selected]['managers']:
  instruction='Nearest known feasible exit by estimated travel time' if m['exit']=='nearest-time' else m['exit'].replace('-',' ')
  tex.append(f"{m['id']} & \\texttt{{{m['node']}}} & {instruction}"+r'\\')
 tex += [r'\bottomrule\end{tabularx}',r'\caption{Selected simulated messages. Posts are graph junctions, not approved standing positions.}\end{table}']
tex += [r'The paired comparisons use Student-t intervals with Bonferroni simultaneous 95\% coverage across the six candidate contrasts. Selection uses the same sample, so it is not independent confirmation or a claim of global optimality. Unfinished runs remain in the success denominator and prevent an unconditional mean.',
 r'For implementation in the hall, fixed destination messages must map to clear local directions, with balcony foyer guidance using the appropriate rear stairs. Staff must remain clear of door swings and crowd movement, and speech and existing signs must agree. A generic nearest-time instruction assumes listeners can estimate route time from known exits and visible queues; this comprehension is not validated. The physical-placement limits in Section~\ref{sec:practical-review} remain applicable. These results do not authorize changing the venue emergency plan.']
(ROOT/'docs/model/manager-policy-results.tex').write_text('\n\n'.join(tex)+'\n')

# Mechanism and verification are conditional on the evaluated policy and recorded checks.
mechanism = "Nearest-time guidance keeps a single public instruction. Listeners evaluate known feasible routes using their current position and visible queues; managers do not periodically switch public destinations in response to congestion."
v=comparison('nearest-all','nearest-foyer-balcony')
if v['familywise95'] and v['familywise95'][0] <= 0 <= v['familywise95'][1]:
    mechanism += " The foyer-directed balcony variant is statistically close to the all-nearest variant; the adjusted interval for their paired difference includes zero. A selected sample minimum is not a proven unique optimum."
verification = "Verification records are not yet available for this output directory."
if (OUT/'checks.json').exists() and (OUT/'policy-audit.json').exists():
    check=json.loads((OUT/'checks.json').read_text())
    pa=json.loads((OUT/'policy-audit.json').read_text())['policyAudits']
    chosen=next((p for p in pa if p['policy']==selected), None)
    verification = f"All {check['audits']['archives']} archives passed hash and crossing-count audits, with exact full-result replay of the first seed of each policy. All {sum(p['commitments'] for p in pa)} final commitments were checked for connected routes and absence of later updates."
    if chosen:
        verification += f" The selected arm had {chosen['commitments']} final commitments, including {chosen['changedExits']} exit changes, and {chosen['wheelchairOutside']}/{COUNT*3} wheelchair-user observations reached the exterior and {chosen['wheelchairStreet']}/{COUNT*3} reached street level within the horizon."
    verification += f" The implementation passed {check['engineTests']['passed']} automated tests, {check['browserTests']['passed']} browser tests, TypeScript and the production build. The selected default reproduced its first-seed result completely after normalizing only the scenario title."
p=ROOT/'docs/manager-policy-study.md'
s=p.read_text();s=s.replace('## Real-world interpretation', mechanism+'\n\n## Real-world interpretation');s += '\n## Executed verification\n\n'+verification+'\n\n[Audit details](../results/manager-policy-study/policy-audit.json) · [Check record](../results/manager-policy-study/checks.json)\n';p.write_text(s)
p=ROOT/'docs/model/manager-policy-results.tex';s=p.read_text();s+='\n\n'+mechanism+'\n\n'+verification+'\n';p.write_text(s)
