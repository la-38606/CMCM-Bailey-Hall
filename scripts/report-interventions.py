"""Generate the study report and PDF figures from preserved Monte Carlo evidence.
Usage: PYTHONPATH=.tmp/plot-packages MPLCONFIGDIR=.tmp/matplotlib python3 scripts/report-interventions.py
"""
import json, pathlib, statistics, math, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from study_statistics import describe as stat
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/(sys.argv[1] if len(sys.argv)>1 else 'results/intervention-confirmation')
S=json.loads((OUT/'summary.json').read_text()); P=json.loads((OUT/'protocol.json').read_text())
SEL=json.loads((ROOT/'results/intervention-selection.json').read_text())
selected=SEL['selectedCombined']; barrier=SEL['selectedBarrier']
labels={'baseline':'Original staff assignments','coordinated':'Coordinated staff only','barriers-only':'Full open partitions','partial-barriers':'Partial open belts','dynamic-only':'Dynamic LEDs only','dynamic-partial':'Dynamic LEDs + partial belts','dynamic-combined':'Dynamic LEDs + full partitions'}
names=list(S['summaries']); rows=S['all']; summary=S['summaries']
F=ROOT/'docs/model/figures';F.mkdir(exist_ok=True)
plt.rcParams.update({'font.size':9,'axes.spines.top':False,'axes.spines.right':False,'pdf.fonttype':42,'svg.fonttype':'none'})
colors=dict(zip(names,['#697386','#255a7a','#b77a16','#138579','#9651a4','#bd563c'][:len(names)]))
def paired(a,b):return stat([ra['clearance']-rb['clearance'] for ra,rb in zip(rows[a],rows[b]) if ra['clearance'] is not None and rb['clearance'] is not None])
contrasts={f'{a} minus {b}':paired(a,b) for a,b in [('dynamic-only','coordinated'),(barrier,'coordinated'),(selected,'dynamic-only'),(selected,barrier),(selected,'coordinated'),('coordinated','baseline')]}
interaction=stat([a['clearance']-b['clearance']-c['clearance']+d['clearance'] for a,b,c,d in zip(rows[selected],rows['dynamic-only'],rows[barrier],rows['coordinated']) if all(r['clearance'] is not None for r in [a,b,c,d])])
means={n:stat([r['clearance'] for r in rows[n] if r['clearance'] is not None]) for n in names}
analysis={'means':means,'pairedContrasts':contrasts,'interaction':interaction,'selected':selected,'barrier':barrier,'ciMethod':'Two-sided Student t, df=n-1; paired by seed. Censored samples are explicitly completed-only.'}
(OUT/'analysis.json').write_text(json.dumps(analysis,indent=2)+'\n')
fig,axs=plt.subplots(1,2,figsize=(11,4.3),layout='constrained')
for n in names:
 vals=sorted(r['clearance'] for r in rows[n] if r['clearance'] is not None)
 axs[0].step(vals,np.arange(1,len(vals)+1)/len(rows[n]),where='post',label=labels[n],color=colors[n])
axs[0].axvline(180,color='#aa2638',linestyle='--',linewidth=1)
axs[0].set(xlabel='Full-house exterior clearance (s)',ylabel='Fraction of all replications cleared',ylim=(0,1.02))
axs[0].legend(fontsize=7,loc='lower right');axs[0].grid(alpha=.15)
for i,n in enumerate(names):
 if summary[n]['unresolved']:continue
 m=means[n];axs[1].errorbar(m['mean'],i,xerr=[[m['mean']-m['ci95'][0]],[m['ci95'][1]-m['mean']]],fmt='o',capsize=4,color=colors[n])
axs[1].axvline(180,color='#aa2638',linestyle='--',linewidth=1)
axs[1].set_yticks(range(len(names)),[labels[n] for n in names]);axs[1].invert_yaxis();axs[1].set_xlabel('Mean clearance with 95% confidence interval (s)');axs[1].grid(axis='x',alpha=.15)
fig.savefig(F/'monte-carlo-comparison.pdf');fig.savefig(F/'monte-carlo-comparison.png',dpi=180);plt.close(fig)
# Exit redistribution and paired effect plots.
fig,axs=plt.subplots(1,2,figsize=(11,4.2),layout='constrained')
exits=list(summary[names[0]]['exitUsage']);x=np.arange(len(exits))
for i,n in enumerate(['coordinated','dynamic-only',selected]):axs[0].bar(x+(i-1)*.25,[summary[n]['exitUsage'][e] for e in exits],width=.25,label=labels[n],color=colors[n])
axs[0].set_xticks(x,['Foyer','W portico','E portico','W stage','E stage','NW balcony','NE balcony'],rotation=35,ha='right');axs[0].set_ylabel('Mean occupants per replication');axs[0].legend(fontsize=7)
vals=[a['clearance']-b['clearance'] for a,b in zip(rows[selected],rows['coordinated']) if a['clearance'] is not None and b['clearance'] is not None]
axs[1].hist(vals,bins=15,color=colors[selected],edgecolor='white');axs[1].axvline(0,color='#aa2638',linestyle='--');axs[1].set(xlabel='Combined minus coordinated-staff clearance (s)',ylabel='Paired replications')
fig.savefig(F/'intervention-effects.pdf');fig.savefig(F/'intervention-effects.png',dpi=180);plt.close(fig)
def fmt(x):return '—' if x is None else f'{x:.1f}'
def ci(x):return '—' if x is None else (f'{x[0]:.1f} to {x[1]:.1f}' if x[0]<0 else f'{x[0]:.1f}–{x[1]:.1f}')
lines=['# Literature-based LED and open-barrier Monte Carlo study','',f"Engine {S['engineVersion']}; {len(names)} fixed policies × {P['count']} replications, seeds {P['first']}–{P['first']+P['count']-1}. All policies use 1,329 occupants, the same audience distributions and six managers. The combination selected before validation is **{labels[selected]}**.",'','## Confirmatory results','', '| Policy | Completed / 100 | Mean (s) | SD (s) | 95% CI for mean (s) | ≤180 s |','| --- | ---: | ---: | ---: | ---: | ---: |']
for n in names:
 v=summary[n];m=means[n]
 lines.append(f"| {labels[n]} | {v['resolved']} | {fmt(v['mean'])} | {fmt(m['sd']) if not v['unresolved'] else 'conditional only'} | {ci(m['ci95']) if not v['unresolved'] else 'not estimable'} | {v['successes']}/100 |")
lines+=['', '![Clearance distributions and means](model/figures/monte-carlo-comparison.png)','', 'An unconditional mean is suppressed whenever a run remains unfinished at 900 s. Confidence intervals use Student t with 99 degrees of freedom and quantify Monte Carlo sampling uncertainty under this fixed model, not physical or parameter uncertainty. They are nominal intervals without multiplicity adjustment. The success count is a separate criterion from the mean.','', '## Paired effects','', '| Difference (negative is faster) | Complete pairs | Mean difference (s) | 95% CI (s) |','| --- | ---: | ---: | ---: |']
for k,v in contrasts.items():
 a,b=k.split(' minus ');lines.append(f"| {labels[a]} minus {labels[b]} | {v['n']} | {fmt(v['mean'])} | {ci(v['ci95'])} |")
lines += ['',f"Factorial interaction (combined − LEDs − barriers + coordinated staff): {fmt(interaction['mean'])} s; 95% CI {ci(interaction['ci95'])} s. An effect conditional on completed pairs is not an unconditional effect if any pair is censored.",'','![Exit redistribution and paired improvement](model/figures/intervention-effects.png)','', '## What changed and what stayed fixed','', '- Corrected continuous lanes across divided rear stairs and stepped cross-aisles; existing traffic can drain lanes closed to new admissions. Opposite gate faces retain distinct queues sharing the same total gate capacity.', '- A moving occupant changes destination on new guidance only for a locally estimated improvement of at least 8 s or a known infeasible current route. Final exterior crossings are committed. Individual preferences and compliance are not redrawn.', '- The coordinated six-manager case changes CM2, CM3, CM5 and CM6 messages to the foyer. Posts, activation timing, hearing and acceptance distributions remain fixed. CM1 and CM4 retain portico recommendations.', '- Sixteen public LED strips occupy existing walks; activation 3 s, view range 8 m, detection 0.77, acceptance 0.80. Dynamic route changes retain 5 s total observation delay, an 8 s improvement margin and a 20 s message hold.', '- Belts are low/open and introduce no opaque surfaces. Partial candidates are 1 m long at 30 degrees on corridor-3 and corridor-8: projected span 0.5 m, bypass 1.9 m, and three lanes instead of four. Full-partition alternatives span the same 2.4 m corridors and close those connections. No exit threshold is occupied.', '- Population, body sizes, age/speed/response distributions, row counts, door widths, physical service rules, accessibility and assistance rules are unchanged in the main comparisons. Barriers never receive a capacity bonus.','', '## Accessibility, waiting and crowding','', '| Policy | Wheelchair exterior / 300 | Wheelchair street / 300 | Mean person queue wait (s) | Mean dense person-seconds |','| --- | ---: | ---: | ---: | ---: |']
for n in names:
 v=summary[n];lines.append(f"| {labels[n]} | {v['accessibleOutside']} | {v['accessibleStreet']} | {v['meanWait']:.1f} | {v['meanDensePersonSeconds']:.0f} |")
lines+=['','Dense person-seconds sum occupancy × sampled duration on links above 2 persons/m². This is a network crowding indicator, not injury risk. Accessible street arrival includes the unchanged two-team assistance model.','', '## Selection, reproducibility and limits','',f"Selection was recorded in [the frozen selection record](../results/intervention-selection.json) before any confirmatory audience was evaluated. Pilot seeds 3001–3020 are separate from validation seeds 5001–5100. All exploratory attempts, including slower designs and algorithm diagnostics, are preserved. The first baseline comparison changes manager messages; the factorial comparisons hold them fixed.",'',f"Source fingerprint: `{S['sourceHash']}`. Batch wall time: {S['wallSeconds']/60:.1f} minutes.",'','The initial 100-run study used engine 1.0.0 and is not the control arm for these interventions: it contained the documented lane and late-guidance defects. Its original data and source archive remain preserved.','', 'The reconstructed widths, row allocation, visibility, behavior and assistance assumptions are not calibrated against a Bailey Hall evacuation. An improved simulated mean is not an operational safety guarantee. Parameter sensitivities and numerical refinement are reported separately.','', '[Evidence review](research/intervention-evidence.md) · [Development history](research/development-history.md) · [Per-run CSV](../'+str(OUT.relative_to(ROOT))+'/replications.csv) · [Machine-readable summary](../'+str(OUT.relative_to(ROOT))+'/summary.json) · [Statistical contrasts](../'+str(OUT.relative_to(ROOT))+'/analysis.json)','']
(ROOT/'docs/intervention-study.md').write_text('\n'.join(lines))
tex=[r'\section{Monte Carlo Intervention Results}\label{sec:results}',f"The confirmatory experiment uses engine {S['engineVersion']} and {len(names)} fixed policies, each with 100 fresh audiences (seeds 5001--5100). The selected combined layout was frozen after pilot experiments and before the confirmatory runs. Each seed preserves audience attributes across policies. Mean and paired-difference intervals use Student t with 99 degrees of freedom; these nominal intervals have no multiplicity adjustment and exclude model uncertainty. All means below refer to full-house exterior clearance, not individual average exit time.",r'\begin{table}[htbp]\centering\small',r'\begin{tabular}{lrrrr}\toprule',r'Policy & Complete & Mean (s) & SD (s) & $T\leq180$\\\midrule']
for n in names:
 v=summary[n];tex.append(f"{labels[n]} & {v['resolved']}/100 & {fmt(v['mean'])} & {fmt(means[n]['sd']) if not v['unresolved'] else '--'} & {v['successes']}/100"+r'\\')
tex += [r'\bottomrule\end{tabular}',r'\caption{Independent validation audiences; common seeds pair policies. Means are withheld if any run is censored at 900 s.}\end{table}']
v=summary[selected];m=means[selected];tex += [f"For the preselected combination, the mean is {fmt(v['mean'])} s, with Monte Carlo 95\\% confidence interval {ci(m['ci95']) if not v['unresolved'] else 'not estimable'} s. Its 180 s success fraction is {v['successes']}/100; the Wilson 95\\% interval is {100*v['successWilson95'][0]:.1f}--{100*v['successWilson95'][1]:.1f}\\%. An average below the target, when attained, is not a guarantee for each audience."]
tex += [r'\begin{figure}[htbp]\centering\includegraphics[width=\linewidth]{figures/monte-carlo-comparison.pdf}',r'\caption{Clearance distributions retain all replications in the denominator. The dashed line marks 180 s. Error bars are 95\% confidence intervals for the mean, not prediction intervals.}\end{figure}',r'\begin{table}[htbp]\centering\small',r'\begin{tabular}{lrr}\toprule',r'Paired contrast & Mean difference (s) & 95\% CI (s)\\\midrule']
short={f'dynamic-only minus coordinated':'LED effect without barriers',f'{barrier} minus coordinated':'Barrier effect without LEDs',f'{selected} minus dynamic-only':'Barrier effect with LEDs',f'{selected} minus coordinated':'Combined effect'}
for k,label in short.items():vv=contrasts[k];tex.append(f"{label} & {fmt(vv['mean'])} & {ci(vv['ci95'])}"+r'\\')
tex += [r'\bottomrule\end{tabular}',r'\caption{Within-seed differences; negative means faster. These isolate interventions from staff coordination and engine corrections.}\end{table}',r'\begin{figure}[htbp]\centering\includegraphics[width=\linewidth]{figures/intervention-effects.pdf}',r'\caption{Exit redistribution and paired combined-policy differences. No additional door capacity is assigned to guidance or barriers.}\end{figure}',f"The selected combination evacuated {v['accessibleOutside']}/300 wheelchair-user observations across the exterior boundary and {v['accessibleStreet']}/300 to street level. The three observations within each replication share the crowd environment. Mean accumulated queue wait was {v['meanWait']:.1f} s per person. Full logs, policy JSON, source hashes and per-seed results accompany the repository report.",r'\input{intervention-validation-results}']
(ROOT/'docs/model/intervention-study-results.tex').write_text('\n\n'.join(tex)+'\n')
print(json.dumps(analysis,indent=2))
# Interpret the predeclared contrasts without promoting a small difference into a benefit.
staff=contrasts['coordinated minus baseline'];led=contrasts['dynamic-only minus coordinated'];belt=contrasts[f'{selected} minus dynamic-only']
interpretation=[f"Changing the six managers' messages changes mean clearance by {fmt(staff['mean'])} s relative to the original messages. Adding dynamic LEDs to coordinated staff changes it by {fmt(led['mean'])} s. These comparisons use the same corrected engine and separate staffing information from the device effects."]
if belt['ci95']:
 lo,hi=belt['ci95']
 if lo <= 0 <= hi:
  interpretation.append(f"Adding partial belts to the LED layout changes mean clearance by {fmt(belt['mean'])} s (paired 95% CI {ci(belt['ci95'])} s). The interval includes zero: the study does not establish an incremental belt benefit, and this is not proof of equivalence.")
 elif lo > 0:
  interpretation.append(f"Adding partial belts to LEDs increases mean clearance by {fmt(belt['mean'])} s (paired 95% CI {ci(belt['ci95'])} s). The combined layout may meet the average benchmark, but the belts themselves worsen this model's mean relative to LEDs alone.")
 else:
  interpretation.append(f"Adding partial belts to LEDs reduces mean clearance by {fmt(-belt['mean'])} s (paired difference 95% CI {ci(belt['ci95'])} s). This is specific to the tested layout and assumptions, not a general barrier benefit.")
if any(v['n']<P['count'] for v in [staff,led,belt]):
 interpretation.append('Contrasts with fewer complete pairs are conditional on both policies clearing; no unconditional improvement is inferred from them.')
interpretation.append('The slower-response sensitivity and time-step differences must be considered alongside the main result. The 180-second criterion is conditional on the reference audience and prompt response assumptions, not a demonstrated property of the real hall.')
p=ROOT/'docs/intervention-study.md';content=p.read_text();content=content.replace('## What changed and what stayed fixed','## Interpretation\n\n'+'\n\n'.join(interpretation)+'\n\n## What changed and what stayed fixed');p.write_text(content)
p=ROOT/'docs/model/intervention-study-results.tex';content=p.read_text();content=content.replace(r'\input{intervention-validation-results}',r'\subsection{Interpretation of the Comparisons}'+'\n\n'+'\n\n'.join(x.replace('%',r'\%') for x in interpretation)+'\n\n'+r'\input{intervention-validation-results}');p.write_text(content)
selectedSummary=summary[selected]
abstract=(f"The revised computational study compares five fixed policies on 100 fresh audiences each. Original staff instructions yield a mean of {fmt(summary['baseline']['mean'])} s; coordinated staff alone yield {fmt(summary['coordinated']['mean'])} s. The preselected dynamic-LED and partial-belt combination yields {fmt(selectedSummary['mean'])} s, with {selectedSummary['successes']}/100 replications clearing by 180 s. These are fixed-model results, not Bailey measurements. Slower response and material time-step sensitivity limit their operational interpretation.")
(ROOT/'docs/model/intervention-abstract-results.tex').write_text(abstract+'\n')
