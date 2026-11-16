import type { Guide, GridSettings } from './guides'
/** All geometry is physical document pixels; zoomPercent uses the editor's 25/100/400 convention. */
export type SnapRect = { x:number; y:number; width:number; height:number }
export type SnapAxis = 'x'|'y'
export type SnapSource = 'guide'|'canvas'|'object'|'grid'
export type SnapAnchor = 'start'|'center'|'end'
export type SnapTarget = Readonly<{position:number;source:SnapSource;targetId:string}>
export type SnapHit = SnapTarget & {anchor:SnapAnchor;correction:number;screenDistance:number}
export type SnapHits = Partial<Record<SnapAxis,SnapHit>>
export type SnapObject = {id:string;bounds:SnapRect;visible?:boolean}
export type SnapIndex = Readonly<{x:readonly SnapTarget[];y:readonly SnapTarget[];grid?:Readonly<GridSettings>}>
export type SnapOptions = {zoomPercent:number;thresholdPx?:number;hysteresisPx?:number;enabled?:boolean;altKey?:boolean;mode:'move'|'resize';handle?:string;previous?:SnapHits}
const priority:Record<SnapSource,number>={guide:0,canvas:1,object:2,grid:3}
const finite=(n:number)=>Number.isFinite(n)&&Math.abs(n)<=1e12
function validateRect(r:SnapRect){if(![r.x,r.y,r.width,r.height].every(finite)||r.width<=0||r.height<=0||![r.x+r.width,r.y+r.height].every(finite))throw new Error('吸附包围盒无效')}
function compareTarget(a:SnapTarget,b:SnapTarget){return priority[a.source]-priority[b.source]||(a.targetId<b.targetId?-1:a.targetId>b.targetId?1:0)}
/** Build once at pointer-down (or when references change), never inside a render/frame loop. */
export function createSnapIndex(options:{objects?:readonly SnapObject[];excludeIds?:readonly string[];guides?:readonly Guide[];canvas?:{width:number;height:number};grid?:GridSettings}):SnapIndex{
 const x:SnapTarget[]=[],y:SnapTarget[]=[],excluded=new Set(options.excludeIds)
 const push=(axis:SnapAxis,position:number,source:SnapSource,targetId:string)=>{if(!finite(position))throw new Error('吸附参考坐标无效');(axis==='x'?x:y).push(Object.freeze({position,source,targetId}))}
 for(const guide of options.guides??[]) {if(!guide.id||!['x','y'].includes(guide.axis))throw new Error('吸附参考线无效');push(guide.axis,guide.position,'guide',guide.id)}
 if(options.canvas){const {width,height}=options.canvas;if(!finite(width)||!finite(height)||width<=0||height<=0)throw new Error('画布尺寸无效');for(const [axis,size]of [['x',width],['y',height]] as const)for(const p of [0,size/2,size])push(axis,p,'canvas',`canvas-${axis}-${p}`)}
 for(const object of options.objects??[]){if(excluded.has(object.id)||object.visible===false)continue;if(!object.id)throw new Error('吸附对象ID无效');const r=object.bounds;validateRect(r);for(const p of [r.x,r.x+r.width/2,r.x+r.width])push('x',p,'object',object.id);for(const p of [r.y,r.y+r.height/2,r.y+r.height])push('y',p,'object',object.id)}
 // Equal positions need only their highest-priority stable marker. This also avoids
 // scanning 10,000 aligned edges on every frame.
 const sort=(targets:SnapTarget[])=>Object.freeze(targets.sort((a,b)=>a.position-b.position||compareTarget(a,b)).filter((target,i,all)=>i===0||target.position!==all[i-1].position))
 const grid=options.grid
 if(grid&&(![grid.spacingX,grid.spacingY].every(n=>finite(n)&&n>0)||![grid.originX,grid.originY].every(finite)))throw new Error('网格间距无效')
 return Object.freeze({x:sort(x),y:sort(y),...(grid?{grid:Object.freeze({...grid})}:{})})
}
function lowerBound(targets:readonly SnapTarget[],position:number){let low=0,high=targets.length;while(low<high){const middle=(low+high)>>>1;if(targets[middle].position<position)low=middle+1;else high=middle}return low}
function anchors(rect:SnapRect,axis:SnapAxis,options:SnapOptions):Array<{anchor:SnapAnchor;position:number}>{
 const start=rect[axis],size=axis==='x'?rect.width:rect.height
 if(options.mode==='move')return [{anchor:'start',position:start},{anchor:'center',position:start+size/2},{anchor:'end',position:start+size}]
 const handle=options.handle??''
 if(handle.includes(axis==='x'?'w':'n'))return [{anchor:'start',position:start}]
 if(handle.includes(axis==='x'?'e':'s'))return [{anchor:'end',position:start+size}]
 return []
}
/** previous should come from the preceding *unsnapped pointer proposal* in the same gesture. */
export function snapBounds(index:SnapIndex,rect:SnapRect,options:SnapOptions):{rect:SnapRect;hits:SnapHits;stats:{inspected:number}}{
 validateRect(rect)
 const {zoomPercent,thresholdPx=6,hysteresisPx=2}=options
 if(!finite(zoomPercent)||zoomPercent<=0||!finite(thresholdPx)||thresholdPx<0||!finite(hysteresisPx)||hysteresisPx<0||!['move','resize'].includes(options.mode))throw new Error('吸附缩放或阈值无效')
 if(options.mode==='resize'&&!['n','ne','e','se','s','sw','w','nw'].includes(options.handle??''))throw new Error('缩放控制点无效')
 const result={...rect},hits:SnapHits={},stats={inspected:0}
 if(options.altKey||options.enabled===false)return {rect:result,hits,stats}
 const scale=zoomPercent/100
 for(const axis of ['x','y'] as const){
  const positions=anchors(rect,axis,options),targets=index[axis],size=axis==='x'?rect.width:rect.height
  const possible=(a:SnapAnchor,c:number)=>options.mode!=='resize'||(a==='start'?size-c>1e-6:size+c>1e-6)
  let best:SnapHit|undefined
  const previous=options.previous?.[axis]
  if(previous){const anchor=positions.find(a=>a.anchor===previous.anchor);if(anchor){
   // A previous marker must still exist in the current index; never retain removed references.
   let exists=false
   if(previous.source==='grid'&&index.grid?.enabled){const spacing=axis==='x'?index.grid.spacingX:index.grid.spacingY,origin=axis==='x'?index.grid.originX:index.grid.originY;exists=previous.targetId===`grid-${axis}`&&Math.abs((previous.position-origin)/spacing-Math.round((previous.position-origin)/spacing))<1e-8}
   else {for(let i=lowerBound(targets,previous.position);i<targets.length&&targets[i].position===previous.position;i++){stats.inspected++;if(targets[i].targetId===previous.targetId&&targets[i].source===previous.source){exists=true;break}}}
   const correction=previous.position-anchor.position
   if(exists&&Math.abs(correction)*scale<=thresholdPx+hysteresisPx&&possible(anchor.anchor,correction))best={...previous,correction,screenDistance:Math.abs(correction)*scale}
  }}
  if(!best)for(const anchor of positions){
   const consider=(target:SnapTarget)=>{stats.inspected++;const correction=target.position-anchor.position,distance=Math.abs(correction)*scale;if(distance>thresholdPx+1e-9||!possible(anchor.anchor,correction))return;const candidate={...target,anchor:anchor.anchor,correction,screenDistance:distance};if(!best||distance<best.screenDistance-1e-9||(Math.abs(distance-best.screenDistance)<=1e-9&&compareTarget(candidate,best)<0))best=candidate}
   // Only the nearest coordinate on each side can win by distance. The
   // sorted index already resolves equal-coordinate priorities.
   const next=lowerBound(targets,anchor.position)
   if(next<targets.length)consider(targets[next])
   if(next>0)consider(targets[next-1])
   if(index.grid?.enabled){const spacing=axis==='x'?index.grid.spacingX:index.grid.spacingY,origin=axis==='x'?index.grid.originX:index.grid.originY;consider({position:origin+Math.round((anchor.position-origin)/spacing)*spacing,source:'grid',targetId:`grid-${axis}`})}
  }
  if(best){hits[axis]=best;if(options.mode==='move')result[axis]+=best.correction;else {const key=axis==='x'?'width':'height';if(best.anchor==='start'){result[axis]+=best.correction;result[key]-=best.correction}else result[key]+=best.correction}}
 }
 return {rect:result,hits,stats}
}
/** Rotate about center in physical coordinates before deriving the snap AABB. */
export function rotatedBounds(rect:SnapRect,degrees:number):SnapRect{
 validateRect(rect);if(!finite(degrees))throw new Error('旋转角度无效')
 const a=degrees*Math.PI/180,c=Math.abs(Math.cos(a)),s=Math.abs(Math.sin(a)),width=rect.width*c+rect.height*s,height=rect.width*s+rect.height*c
 return {x:rect.x+(rect.width-width)/2,y:rect.y+(rect.height-height)/2,width,height}
}
