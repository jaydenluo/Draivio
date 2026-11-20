import type { EditorState } from '../state/editor'
import { moveTargetBounds, translateMoveTargets } from './moveTargets'
import { selectedObjects } from './objectProperties'
export type ObjectAlignment='left'|'center'|'right'|'top'|'middle'|'bottom'|'horizontal'|'vertical'
export function arrangeObjects(state:EditorState,mode:ObjectAlignment){
 const ids=new Set(selectedObjects(state).map(o=>o.object.id))
 const targets=(state.selectedCanvasTargets??[]).filter(t=>ids.has(t.id))
 const items=targets.map(t=>({t,r:moveTargetBounds(state,[t])})).filter((i):i is typeof i&{r:NonNullable<typeof i.r>}=>!!i.r)
 if(items.length<2)return state
 const x=Math.min(...items.map(i=>i.r.x)),y=Math.min(...items.map(i=>i.r.y)),right=Math.max(...items.map(i=>i.r.x+i.r.width)),bottom=Math.max(...items.map(i=>i.r.y+i.r.height))
 let next=state
 if(mode==='horizontal'||mode==='vertical'){
  if(items.length<3)return state
  const axis=mode==='horizontal'?'x':'y',size=axis==='x'?'width':'height'
  items.sort((a,b)=>a.r[axis]-b.r[axis])
  const first=items[0].r[axis],last=items.at(-1)!.r[axis]+items.at(-1)!.r[size]
  const gap=(last-first-items.reduce((v,i)=>v+i.r[size],0))/(items.length-1)
  let pos=first
  for(const i of items){next=translateMoveTargets(next,[i.t],{x:axis==='x'?pos-i.r.x:0,y:axis==='y'?pos-i.r.y:0});pos+=i.r[size]+gap}
 }else for(const {t,r} of items){const dx=mode==='left'?x-r.x:mode==='center'?(x+right-r.width)/2-r.x:mode==='right'?right-r.width-r.x:0,dy=mode==='top'?y-r.y:mode==='middle'?(y+bottom-r.height)/2-r.y:mode==='bottom'?bottom-r.height-r.y:0;next=translateMoveTargets(next,[t],{x:dx,y:dy})}
 return next
}
