"""Plot the frozen manager-policy comparison; no engine parameters are fitted."""
import json
import pathlib
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'results/manager-policy-study'
a=json.loads((OUT/'analysis.json').read_text())
d=json.loads((OUT/'design.json').read_text())
labels={'current-nearest':'Nearest lower floor / original balcony','nearest-all':'All six nearest-time','coordinated':'Fixed coordinated destinations','nearest-foyer-balcony':'Nearest lower floor / foyer from balcony'}
colors=['#697386','#b77a16','#138579','#255a7a']
plt.rcParams.update({'font.size':9,'axes.spines.top':False,'axes.spines.right':False,'pdf.fonttype':42})
fig,axs=plt.subplots(1,2,figsize=(12,4.3),layout='constrained')
for i,(name,color) in enumerate(zip(d['policies'],colors)):
 rows=json.loads((OUT/name/'replications.json').read_text())
 values=sorted(r['clearance'] for r in rows if r['clearance'] is not None)
 axs[0].step(values,np.arange(1,len(values)+1)/len(rows),where='post',color=color,label=labels[name])
 m=a['means'][name]
 if len(values)==len(rows):
  axs[1].errorbar(m['mean'],i,xerr=[[m['mean']-m['ci95'][0]],[m['ci95'][1]-m['mean']]],fmt='o',capsize=4,color=color)
 else:
  axs[1].text(180,i,'Unconditional mean not estimable',fontsize=7)
for ax in axs:
 ax.axvline(180,color='#aa2638',linestyle='--',linewidth=1)
 ax.grid(alpha=.15)
axs[0].set(xlabel='Full-house exterior clearance (s)',ylabel='Fraction of all replications cleared',ylim=(0,1.02))
axs[0].legend(fontsize=7,loc='lower right')
axs[1].set_yticks(range(len(labels)),[labels[n] for n in d['policies']]);axs[1].invert_yaxis();axs[1].set_xlabel('Mean clearance, nominal 95% confidence interval (s)')
F=ROOT/'docs/model/figures'
fig.savefig(F/'manager-policy-comparison.pdf');fig.savefig(F/'manager-policy-comparison.png',dpi=180)
plt.close(fig)
