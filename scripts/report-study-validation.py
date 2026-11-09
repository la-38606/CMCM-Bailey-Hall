"""Append audited sensitivity and numerical checks to the intervention report."""
import json, pathlib, statistics, math
from study_statistics import describe
R=pathlib.Path(__file__).resolve().parents[1]
def read(name):
 p=R/'results'/name
 return json.loads((p/'summary.json').read_text()),json.loads((p/'audit.json').read_text())
ref,ar=read('intervention-refinement');comp,ac=read('intervention-compliance');resp,ap=read('intervention-response');main,am=read('intervention-confirmation')
checks=json.loads((R/'results/intervention-verification.json').read_text())
def num(x):return '—' if x is None else f'{x:.1f}'
def paired(s,a,b):
 v=[x['clearance']-y['clearance'] for x,y in zip(s['all'][a],s['all'][b]) if x['clearance'] is not None and y['clearance'] is not None]
 d=describe(v)
 return {**d,'conditional':d['n']!=len(s['all'][a])}
effects={'lowComplianceMinusNominal':paired(comp,'compliance-low','compliance-nominal'),'slowerResponseCombinedMinusBaseline':paired(resp,'response-combined','response-baseline')}
validation={'checks':checks,'audits':{n:a for n,a in [('confirmation',am),('refinement',ar),('compliance',ac),('response',ap)]},'sensitivityEffects':effects,'refinement':[{'seed':a['seed'],'coarse':a['clearance'],'fine':b['clearance'],'difference':None if a['clearance'] is None or b['clearance'] is None else b['clearance']-a['clearance']} for a,b in zip(ref['all']['refinement-coarse'],ref['all']['refinement-fine'])]}
(R/'results/intervention-confirmation/validation.json').write_text(json.dumps(validation,indent=2)+'\n')
md=['## Numerical refinement','','Only the integration interval changes; the audience and selected combined layout are fixed. These seeds overlap the first three confirmatory audiences and are not additional independent evidence for policy selection.','','| Seed | 0.1 s step: clearance (s) | 0.0125 s step: clearance (s) | Fine − coarse (s) |','| --- | ---: | ---: | ---: |']
tex=[r'\subsection{Numerical Refinement and Sensitivities}',r'The selected combination was rerun for the first three validation audiences with $\Delta t=0.0125$ s, compared with the prescribed 0.1 s step. Only the integration interval changes. These are numerical checks, not three additional independent validation audiences.',r'\begin{table}[htbp]\centering\small',r'\begin{tabular}{rrrr}\toprule',r'Seed & Coarse clearance (s) & Fine clearance (s) & Fine minus coarse (s)\\\midrule']
for v in validation['refinement']:
 md.append(f"| {v['seed']} | {num(v['coarse'])} | {num(v['fine'])} | {num(v['difference'])} |")
 tex.append(f"{v['seed']} & {num(v['coarse'])} & {num(v['fine'])} & {num(v['difference'])}"+r'\\')
tex += [r'\bottomrule\end{tabular}\caption{Time-step refinement; full-run invariant and replay checks pass at both steps.}\end{table}']
warning='The full network exhibits material numerical sensitivity: route decisions and lane-request ordering can change discontinuously. These three pairs do not establish time-step convergence. Isolated saturated-gate tests verify the prescribed throughput at both intervals, but that does not imply a converged full-house clearance estimate. The 0.1 s reference is retained regardless of whether refinement is faster or slower. Monte Carlo confidence intervals exclude this numerical uncertainty.'
md += ['',warning,'','## Parameter sensitivities','','These use 20 fresh audiences per policy, seeds 6001–6020, with matched audiences within each pair. The selected layout remains frozen. Lower guidance changes staff acceptance from 0.85 to 0.70, LED detection from 0.77 to 0.60, and LED acceptance from 0.80 to 0.60. Slower response changes recognition/preparation medians from 6/14 s to 10/30 s. These are declared stress cases, not calibrated probabilities or retuning.','','| Sensitivity policy | Complete / 20 | Mean clearance (s) | ≤180 s |','| --- | ---: | ---: | ---: |']
tex += [warning,r'Two separately labelled parameter sensitivities use 20 audiences per policy, seeds 6001--6020. The low-guidance case changes staff acceptance from 0.85 to 0.70, LED detection from 0.77 to 0.60, and LED acceptance from 0.80 to 0.60. The slow-response cases use recognition and preparation medians of 10 and 30 s instead of 6 and 14 s. These assumptions are stress cases, not fitted literature estimates. Main-study parameters and layouts remain unchanged.',r'\begin{table}[htbp]\centering\small',r'\begin{tabular}{lrrr}\toprule',r'Case & Complete & Mean (s) & $T\leq180$\\\midrule']
for s,n,label in [(comp,'compliance-nominal','Combined, nominal guidance'),(comp,'compliance-low','Combined, weaker guidance'),(resp,'response-baseline','Original staff, slower response'),(resp,'response-combined','Combined, slower response')]:
 v=s['summaries'][n];md.append(f"| {label} | {v['resolved']}/20 | {num(v['mean'])} | {v['successes']}/20 |")
 tex.append(f"{label} & {v['resolved']}/20 & {num(v['mean'])} & {v['successes']}/20"+r'\\')
tex += [r'\bottomrule\end{tabular}\caption{Separate parameter sensitivities. A censored case has no unconditional mean.}\end{table}']
for key,label in [('lowComplianceMinusNominal','Weaker guidance minus nominal guidance'),('slowerResponseCombinedMinusBaseline','Combined minus original staff under slower response')]:
 v=effects[key];sentence=f"{label}: paired mean difference {num(v['mean'])} s over {v['n']} complete pairs."
 if v['ci95']:sentence+=f" Student-t 95% interval: {num(v['ci95'][0])} to {num(v['ci95'][1])} s."
 if v['conditional']:sentence+=' This is conditional on both runs completing; it is not an unconditional intervention effect.'
 md+=['',sentence];tex+=[sentence.replace('%',r'\%')]
tail_note='The slow-response tail is visible in individual records: in seed 6008, the last occupant has a sampled preparation delay of 301.8 s and crosses outside at 352.8 s; in seed 6020 the corresponding delay is 312.9 s and clearance is 349.3 s. These are model draws, not observed people. No response-tail truncation was introduced to force the benchmark, and neither last occupant changes destination after the initial choice in these records.'
md+=['',tail_note,'', '[Tail diagnostics](../results/intervention-response/tail-diagnostics.json) retain the sampled values and route events.']
tex+=[tail_note]
md+=['','## Verification and audit','',f"- {checks['engineTests']['passed']} engine tests passed; {checks['browserTests']['passed']} browser tests passed; TypeScript and production build passed.",f"- All {am['checked']} confirmatory archives were checked against their hashes and crossing events; {am['uniqueAudiences']} distinct initial audiences were paired identically across policies.",f"- Full results were reproduced exactly for the first seed of each of the {len(am['fullResultReplays'])} confirmatory policies.",'- All six refinement and 80 sensitivity archives were audited, including a full replay of the first seed of every policy.','- Every run checks population, storage, valid transitions and wheelchair routing. All layouts preserve sightlines and accessible connectivity in the reconstructed geometry.','', 'Physical implementation validation remains limited to the declared queue-network rules and supplied plans. No measured Bailey evacuation or surveyed usable widths were available. External crowd spillback, continuous body interactions and assistance-team travel are not represented. These omissions and the numerical sensitivity prevent treating a mean below 180 s as an operational guarantee.','']
tex += [r'\subsection{Verification and Reproducibility}',f"The original engine 1.3.0 study implementation passed {checks['engineTests']['passed']} automated engine tests and {checks['browserTests']['passed']} browser tests, plus TypeScript and production builds. All {am['checked']} confirmatory archives and all 86 numerical/sensitivity archives were audited against hashes and reconstructed crossing counts. Each study exactly replayed the complete first-seed result for every policy. Initial audience hashes confirm distinct audiences across replications and identical paired audiences across policies. Every run enforces population conservation, storage, connectivity and accessibility invariants. These checks establish consistency with the declared model, not empirical validation of Bailey Hall."]
(R/'docs/model/intervention-validation-results.tex').write_text('\n\n'.join(tex)+'\n')
section='\n<!-- GENERATED VALIDATION -->\n'
p=R/'docs/intervention-study.md';s=p.read_text().split(section)[0];p.write_text(s+section+'\n'.join(md))
print(json.dumps({'refinement':validation['refinement'],'effects':effects,'auditedArchives':sum(a['checked'] for a in validation['audits'].values())},indent=2))
