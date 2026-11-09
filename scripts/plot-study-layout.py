"""Render the same engine geometry used by the simulation, as a schematic."""
import json,pathlib,sys,math
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
R=pathlib.Path(__file__).resolve().parents[1]
d=json.loads(pathlib.Path(sys.argv[1] if len(sys.argv)>1 else R/'.tmp/study-geometry.json').read_text());g=d['geometry'];c=d['config'];nodes=g['nodes']
F=R/'docs/model/figures';F.mkdir(exist_ok=True)
plt.rcParams.update({'font.size':8,'pdf.fonttype':42})
fig,axs=plt.subplots(1,2,figsize=(11,7),layout='constrained')
for floor,ax in enumerate(axs):
 for e in g['links'].values():
  if nodes[e['a']]['floor']!=floor:continue
  pts=e['points']; xs=[p['x'] for p in pts];ys=[p['y'] for p in pts]
  ax.plot(xs,ys,color='#bec6cd' if e['kind']=='row' else '#72808c',linewidth=.45 if e['kind']=='row' else 1.1,alpha=.65)
 for i,s in enumerate(c['signs']):
  e=g['links'][s['link']]
  if nodes[e['a']]['floor']!=floor:continue
  pts=e['points'];ax.plot([p['x'] for p in pts],[p['y'] for p in pts],color='#0a9a85',linewidth=2.7,zorder=5)
  p=nodes[s['node']];ax.text(p['x']+.4,p['y']-.4,str(i+1),color='#006b5b',fontsize=7,zorder=8,bbox=dict(facecolor='white',edgecolor='none',pad=.3,alpha=.8))
 for m in c['managers']:
  p=nodes[m['node']]
  if p['floor']!=floor:continue
  ax.scatter(p['x'],p['y'],marker='D',s=30,color='#2265a5',zorder=6);ax.text(p['x']+.7,p['y']+.8,m['id'],color='#17466f',fontsize=7,zorder=9)
 for b in c['barriers']:
  e=g['links'][b['link']];p=nodes[e['a']];q=nodes[e['b']]
  if p['floor']!=floor:continue
  dx=q['x']-p['x'];dy=q['y']-p['y'];l=math.hypot(dx,dy);tx,ty=dx/l,dy/l;nx,ny=-ty,tx
  original=e['width']+abs(b['length']*math.sin(math.radians(b['angle'])))
  x=(p['x']+q['x'])/2-nx*original/2;y=(p['y']+q['y'])/2-ny*original/2
  angle=math.atan2(dy,dx)+math.radians(b['angle']);xx=x+b['length']*math.cos(angle);yy=y+b['length']*math.sin(angle)
  ax.plot([x,xx],[y,yy],color='#bb5825',linewidth=3.6,marker='o',markersize=3,zorder=10)
  ax.annotate(b['link'],((x+xx)/2,(y+yy)/2),xytext=(4 if x>0 else -15,10),textcoords='offset points',fontsize=7,color='#934118')
 for p in nodes.values():
  if p.get('exit') and p['floor']==floor:
   if p['id'] in ['west-portico','east-portico']:continue
   ax.scatter(p['x'],p['y'],marker='s',s=22,color='#343d47',zorder=4)
 ax.set_aspect('equal');ax.invert_yaxis();ax.set(xlabel='Local x (m)',ylabel='Local y (m)',title='Orchestra and mezzanine' if floor==0 else 'Balcony');ax.spines[['top','right']].set_visible(False);ax.text(0,-3.2,'STAGE',ha='center',weight='bold',color='#586474');ax.grid(alpha=.1)
fig.legend(handles=[Line2D([0],[0],color='#72808c',label='Existing circulation'),Line2D([0],[0],color='#0a9a85',lw=3,label='LED strip (numbered)'),Line2D([0],[0],color='#bb5825',lw=3,label='Low/open belt'),Line2D([0],[0],color='#2265a5',marker='D',lw=0,label='Crowd Manager')],loc='outside lower center',ncol=4,frameon=False)
fig.suptitle('Study layout on the simulation network — inferred metric geometry',fontsize=11)
fig.savefig(F/'intervention-layout.pdf');fig.savefig(F/'intervention-layout.png',dpi=180)
