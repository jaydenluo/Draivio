#!/usr/bin/env python3
"""Independent physical-pixel matrix oracle; never imports product alignment code."""
import copy
import json
import math
from pathlib import Path
ROOT=Path(__file__).resolve().parent
W,H=500,400

def transform(x,y,w,h,rotation=0):
    return dict(kind='transform',rect=dict(x=x,y=y,width=w,height=h),rotation=rotation,flipX=False,flipY=False)
def layer(id,color,t,**extra):
    return dict(id=id,name=id,className='layer-art',visible=True,opacity=100,blendMode='正常',transform=t,**extra)
def matrix(t):
    # Pixel coordinates: T(center) R(angle) S(rect.width/100, rect.height/100) T(-W/2,-H/2).
    r=t['rect'];theta=math.radians(t['rotation']);c,s=math.cos(theta),math.sin(theta)
    a,b=c*r['width']/100,s*r['width']/100
    cc,d=-s*r['height']/100,c*r['height']/100
    return [a,b,cc,d,(r['x']+r['width']/2)*W/100-a*W/2-cc*H/2,(r['y']+r['height']/2)*H/100-b*W/2-d*H/2]
def compose(p,q):
    a,b,c,d,e,f=p;g,h,i,j,k,l=q
    return [a*g+c*h,b*g+d*h,a*i+c*j,b*i+d*j,a*k+c*l+e,b*k+d*l+f]
def point(m,x,y):return [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]
def bounds(m):
    pts=[point(m,x,y) for x,y in [(0,0),(W,0),(W,H),(0,H)]]
    xs,ys=zip(*pts);return dict(x=min(xs),y=min(ys),width=max(xs)-min(xs),height=max(ys)-min(ys))
def union(bs):
    return dict(x=min(b['x'] for b in bs),y=min(b['y'] for b in bs),width=max(b['x']+b['width'] for b in bs)-min(b['x'] for b in bs),height=max(b['y']+b['height'] for b in bs)-min(b['y'] for b in bs))
def alignment(bs,ref,key=None):
    out={}
    for name,axis,extent,factor in [('left','x','width',0),('center-horizontal','x','width',.5),('right','x','width',1),('top','y','height',0),('center-vertical','y','height',.5),('bottom','y','height',1)]:
        target=ref[axis]+ref[extent]*factor
        out[name]={id:dict(dx=0 if axis=='y' or id==key else target-b[axis]-b[extent]*factor,dy=0 if axis=='x' or id==key else target-b[axis]-b[extent]*factor) for id,b in bs.items()}
    return out
def distribution(bs,axis):
    extent='width' if axis=='x' else 'height'
    order=sorted(bs,key=lambda id:bs[id][axis]);first,last=bs[order[0]],bs[order[-1]]
    gap=(last[axis]+last[extent]-first[axis]-sum(b[extent] for b in bs.values()))/(len(bs)-1)
    cursor=first[axis];delta={}
    for id in order:
        delta[id]=dict(dx=cursor-bs[id][axis] if axis=='x' else 0,dy=cursor-bs[id][axis] if axis=='y' else 0)
        cursor+=bs[id][extent]+gap
    return dict(order=order,gap=gap,negative=gap<0,deltas=delta)
def project(name,layers,colors,selected):
    rect=dict(x=0,y=0,width=100,height=100);sel=dict(kind='rectangle',mode='new',rect=rect,path=dict(type='shape',kind='rectangle',rect=rect),feather=0,fixedRatio=None)
    shapes=[dict(id='solid-'+id,layerId=id,kind='rectangle',rect=rect,color=color,strokeWidth=0) for id,color in colors.items()]
    return dict(format='draivio',schemaVersion=2,metadata=dict(id=name,name=name),assets={},document=dict(documentWidth=W,documentHeight=H,documentBackground='transparent',layers=layers,selectedLayerId=selected[-1],selectedLayerIds=selected,canvasTexts=[],canvasShapes=shapes,brushStrokes=[],layerMasks={},aiResults=[],selection=sel,selectionRect=rect,selectionVisible=False,cropRect=None,sceneOrder=[s['id'] for s in shapes],prompt='',composerMode='edit',composerSourceId='draivio-cloud',composerParameters=dict(model='fixture',size='500 × 400',ratio='5:4',count='1 张',strength='48%'),history=[]))
def write(name,value): (ROOT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
ls=[layer('red','#ff0000',transform(8,12,16,20)),layer('green','#00ff00',transform(40,35,22,14,30)),layer('blue','#0000ff',transform(72,66,12,18,-45))]
base=project('F07 three rotated layers',ls,dict(red='#ff0000',green='#00ff00',blue='#0000ff'),['red','green','blue'])
write('three-layers.draivio',base)
bs={l['id']:bounds(matrix(l['transform'])) for l in ls};ref=union(list(bs.values()))
main=dict(initialBoundsPx=bs,selectionBoundsPx=ref,keyLayerId='green',alignmentDeltasPx=dict(selection=alignment(bs,ref),canvas=alignment(bs,dict(x=0,y=0,width=W,height=H)),key=alignment(bs,bs['green'],'green')),distributionSelection=dict(horizontal=distribution(bs,'x'),vertical=distribution(bs,'y')))
# Same dimensions, overlapping centers create negative external-edge gaps.
negative=copy.deepcopy(base)
for i,l in enumerate(negative['document']['layers']):l['transform']['rect'].update(x=40+i*2,y=35+i*2)
negative['metadata']=dict(id='F07 negative gaps',name='F07 negative gaps');write('negative-gaps.draivio',negative)
nb={l['id']:bounds(matrix(l['transform'])) for l in negative['document']['layers']}
# Parent transform and child transform compose in physical pixel space.
group=layer('rotated-parent','',transform(20,20,55,50,30),children=['nested-child']);group['className']='layer-group'
child=layer('nested-child','#ff8800',transform(10,10,20,20,-15),groupId='rotated-parent')
locked=layer('locked-ancestor','',transform(60,10,30,30,-20),children=['locked-child'],locked=True);locked['className']='layer-group'
locked_child=layer('locked-child','#8844ff',transform(15,15,35,30,10),groupId='locked-ancestor',locked=False)
free=layer('free-peer','#00aacc',transform(72,65,16,18,15))
hier=project('F07 transformed hierarchy and ancestor lock',[group,child,locked,locked_child,free],{'nested-child':'#ff8800','locked-child':'#8844ff','free-peer':'#00aacc'},['rotated-parent','nested-child','locked-child','free-peer'])
write('hierarchy-locks.draivio',hier)
pm,cm,lm,lcm=matrix(group['transform']),matrix(child['transform']),matrix(locked['transform']),matrix(locked_child['transform'])
hier_bounds={'rotated-parent':bounds(compose(pm,cm)),'free-peer':bounds(matrix(free['transform']))}
child_bounds={'nested-child':bounds(compose(pm,cm)),'free-peer':bounds(matrix(free['transform']))}
key_distribution={}
for direction,axis in [('horizontal','x'),('vertical','y')]:
    kd=distribution(bs,axis); fixed=kd['deltas']['green']; offset=fixed['dx'] if axis=='x' else fixed['dy']
    for delta in kd['deltas'].values():delta['dx' if axis=='x' else 'dy']-=offset
    kd['keyLayerId']='green';key_distribution[direction]=kd
main['distributionKey']=key_distribution
write('manifest.json',dict(schemaVersion=1,units='physical document pixels',documentSize=[W,H],tolerance=1e-7,provenance='Analytic affine corner geometry. No product alignment output used.',scenarios={'three-layers':main,'negative-gaps':dict(initialBoundsPx=nb,distributionSelection=dict(horizontal=distribution(nb,'x'),vertical=distribution(nb,'y'))),'hierarchy-locks':dict(matricesPx={'rotated-parent':pm,'nested-child-world':compose(pm,cm),'locked-ancestor':lm,'locked-child-world':compose(lm,lcm)},worldBoundsPx={'rotated-parent-frame':bounds(pm),'rotated-parent':bounds(compose(pm,cm)),'nested-child':bounds(compose(pm,cm)),'locked-ancestor':bounds(lm),'locked-child':bounds(compose(lm,lcm)),'free-peer':bounds(matrix(free['transform']))},alignmentDeltasPxSelection=alignment(hier_bounds,union(list(hier_bounds.values()))),childOnlyAlignmentDeltasPxSelection=alignment(child_bounds,union(list(child_bounds.values()))),selected=['rotated-parent','nested-child','locked-child','free-peer'],deduplicatedMovableRoots=['rotated-parent','free-peer'],mustNotMutateLocalTransforms=['nested-child','locked-ancestor','locked-child'],rules=['Moving rotated-parent moves nested-child once through parent; child local transform unchanged.','locked-child effective ancestor lock prevents all local/world movement.','World delta must be converted through parent linear inverse for child-only selection.'],childOnlyExample=dict(selected=['nested-child','free-peer'],requestedChildWorldDeltaPx=[20,-10],expectedChildLocalTranslationPx=[(math.cos(math.pi/6)*20+math.sin(math.pi/6)*-10)/.55,(-math.sin(math.pi/6)*20+math.cos(math.pi/6)*-10)/.5]))}))
print('Generated three projects and independent AABB/alignment/distribution manifest.')
