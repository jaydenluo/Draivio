import type { EditorState, Layer } from '../../state/editor'
import { effectiveLayerState, layerParentId } from '../../state/layerHierarchy'

const collections=['layers','canvasShapes','canvasTexts','brushStrokes','layerMasks','smartObjectSources'] as const
type Collection=typeof collections[number]
type Entity=Record<string,unknown>
export type EntityInverse={collection:Collection;id:string;before?:Entity;after?:Entity}
export type StructuralInverse={entities:EntityInverse[];beforeOrder:string[];afterOrder:string[];beforeScene:string[];afterScene:string[]}
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)
const clone=<T,>(value:T):T=>structuredClone(value)
function entries(state:EditorState,key:Collection):Map<string,Entity>{
 const value=state[key]
 return new Map(Array.isArray(value)?value.map(item=>[item.id,item as unknown as Entity]):Object.entries(value) as [string,Entity][])
}
export function recordStructure(before:EditorState,after:EditorState):StructuralInverse|undefined{
 const entities:EntityInverse[]=[]
 for(const collection of collections){const a=entries(before,collection),b=entries(after,collection)
  for(const id of new Set([...a.keys(),...b.keys()])){
   // Surviving layer fields are recorded individually by the normal field inverse.
   if(collection==='layers'&&a.has(id)&&b.has(id))continue
   if(!equal(a.get(id),b.get(id)))entities.push({collection,id,before:clone(a.get(id)),after:clone(b.get(id))})
  }
 }
 const beforeOrder=before.layers.map(l=>l.id),afterOrder=after.layers.map(l=>l.id)
 if(!entities.length&&equal(beforeOrder,afterOrder)&&equal(before.sceneOrder,after.sceneOrder))return
 if(entities.length>1024||Math.max(beforeOrder.length,afterOrder.length)>1024)throw new Error('本次结构修改超出可安全记录的 1024 个对象预算')
 return {entities,beforeOrder,afterOrder,beforeScene:[...before.sceneOrder],afterScene:[...after.sceneOrder]}
}
function owner(item:EntityInverse):string|undefined{return item.collection==='layers'||item.collection==='layerMasks'?item.id:(item.after?.layerId??item.before?.layerId) as string|undefined}
/** Restore the relation changed by AI only if no later reorder moved either
 * endpoint across an unrelated original object. New/manual objects keep order. */
function inverseOrder(current:string[],before:string[],after:string[],warnings:string[]):string[]{
 let out=[...current]
 const common=before.filter(id=>after.includes(id)&&out.includes(id)),b=new Map(before.map((id,i)=>[id,i])),a=new Map(after.map((id,i)=>[id,i]))
 const relation=(ids:string[],x:string,y:string)=>ids.indexOf(x)<ids.indexOf(y)
 const conflicted=(x:string,y:string)=>common.some(z=>z!==x&&z!==y&&[x,y].some(id=>((b.get(id)!<b.get(z)!)===(a.get(id)!<a.get(z)!))&&relation(out,id,z)!==(a.get(id)!<a.get(z)!)))
 for(let i=0;i<common.length;i++)for(let j=i+1;j<common.length;j++){
  const x=common[i],y=common[j]
  if(a.get(x)!<a.get(y)!||relation(out,x,y))continue
  if(conflicted(x,y)){warnings.push(`保留手动排序：${x} / ${y}`);continue}
  // x preceded y originally; restore just that AI-inverted relation.
  out=out.filter(id=>id!==x);out.splice(out.indexOf(y),0,x)
 }
 // Restored deleted IDs were appended; insert them at their original anchors.
 for(const id of before.filter(id=>!after.includes(id)&&out.includes(id)).reverse()){
  out=out.filter(x=>x!==id);const index=before.indexOf(id),next=before.slice(index+1).find(x=>out.includes(x)),prev=before.slice(0,index).reverse().find(x=>out.includes(x))
  out.splice(next?out.indexOf(next):prev?out.indexOf(prev)+1:out.length,0,id)
 }
 return out
}
export function structuralBlockedLayers(state:EditorState,inverse?:StructuralInverse):Set<string>{
 const blocked=new Set<string>();if(!inverse)return blocked
 for(const change of inverse.entities.filter(c=>c.collection==='layers'&&!c.before&&c.after)){
  const layer=state.layers.find(l=>l.id===change.id);if(!layer)continue
  if(!equal(layer,change.after)||effectiveLayerState(state.layers,layer.id).locked){blocked.add(layer.id);continue}
  // A new manual object/mask on an AI-created layer must survive its inverse.
  for(const key of ['canvasShapes','canvasTexts','brushStrokes','layerMasks'] as const){
   for(const [id,value] of entries(state,key))if((key==='layerMasks'?id:value.layerId)===layer.id){
    const expected=inverse.entities.find(c=>c.collection===key&&c.id===id)?.after
    if(!equal(value,expected))blocked.add(layer.id)
   }
  }
  if(state.layers.some(l=>layerParentId(state.layers,l.id)===layer.id&&!((change.after!.children as string[]|undefined)??[]).includes(l.id)))blocked.add(layer.id)
 }
 return blocked
}
export function undoStructure(state:EditorState,inverse:StructuralInverse,blocked:Set<string>,warnings:string[]):{state:EditorState;pending?:StructuralInverse}{
 const next={...state,layers:[...state.layers],canvasShapes:[...state.canvasShapes],canvasTexts:[...state.canvasTexts],brushStrokes:[...state.brushStrokes],layerMasks:{...state.layerMasks},smartObjectSources:{...state.smartObjectSources}},pending:EntityInverse[]=[]
 const put=(change:EntityInverse,value:Entity|undefined)=>{
  const collection=next[change.collection]
  if(Array.isArray(collection)){
   const result=collection.filter(item=>item.id!==change.id);if(value)result.push(clone(value) as never)
   Object.assign(next,{[change.collection]:result})
  }else if(value)(collection as Record<string,unknown>)[change.id]=clone(value);else delete (collection as Record<string,unknown>)[change.id]
 }
 const candidates=new Set([...next.layers.map(l=>l.id),...inverse.entities.filter(c=>c.collection==='layers'&&c.before&&!c.after).map(c=>c.id)])
 // Restore deleted layers before their content. Remove created layers last.
 const depth=(change:EntityInverse)=>{let count=0,parent=change.after?.groupId;const seen=new Set<string>();while(typeof parent==='string'&&!seen.has(parent)){seen.add(parent);count++;parent=inverse.entities.find(c=>c.collection==='layers'&&c.id===parent)?.after?.groupId}return count}
 const changes=[...inverse.entities].sort((a,b)=>Number(b.collection==='layers'&&!!b.before)-Number(a.collection==='layers'&&!!a.before)||(a.collection==='layers'&&b.collection==='layers'&&!a.before&&!b.before?depth(b)-depth(a):0))
 for(const change of changes){
  const current=entries(next,change.collection).get(change.id),layerId=owner(change)
  if(equal(current,change.before))continue // already inverted on an earlier partial attempt
  const currentLayer=layerId&&next.layers.find(l=>l.id===layerId)
  const parent=(change.before?.groupId??change.after?.groupId) as string|undefined
  const locked=change.collection==='layers'&&!currentLayer?parent&&effectiveLayerState(next.layers,parent).locked:layerId&&effectiveLayerState(next.layers,layerId).locked
  const missingParent=change.collection==='layers'&&change.before&&parent&&!candidates.has(parent)
  const remainingChild=change.collection==='layers'&&!change.before&&next.layers.some(l=>l.id!==change.id&&layerParentId(next.layers,l.id)===change.id&&!(l.groupId===change.id || (Array.isArray(change.after?.children)&&change.after.children.includes(l.id))))
  if(change.collection==='layers'&&!change.before&&equal(current,change.after)&&!blocked.has(change.id)){put(change,undefined);continue}
  if(layerId&&blocked.has(layerId)||locked||missingParent||remainingChild||!equal(current,change.after)){
   warnings.push(`保留手动修改或锁定的结构对象：${change.id}`);pending.push(change);continue
  }
  if(change.collection!=='layers'&&change.collection!=='smartObjectSources'&&change.before&&layerId&&!next.layers.some(l=>l.id===layerId)){warnings.push(`目标 ${layerId} 尚未恢复`);pending.push(change);continue}
  put(change,change.before)
  if(change.collection==='layers'&&!change.before)next.layers=next.layers.map(l=>l.children?.includes(change.id)?{...l,children:l.children.filter(id=>id!==change.id)}:l)
 }
 const orderWarnings:string[]=[]
 const order=inverseOrder(next.layers.map(l=>l.id),inverse.beforeOrder,inverse.afterOrder,orderWarnings)
 next.layers=order.map(id=>next.layers.find(l=>l.id===id)!)
 next.sceneOrder=inverseOrder([...next.sceneOrder.filter(id=>[...next.canvasShapes,...next.canvasTexts,...next.brushStrokes].some(o=>o.id===id)),...inverse.beforeScene.filter(id=>!next.sceneOrder.includes(id)&&[...next.canvasShapes,...next.canvasTexts,...next.brushStrokes].some(o=>o.id===id))],inverse.beforeScene,inverse.afterScene,orderWarnings)
 warnings.push(...orderWarnings)
 if(!next.layers.some(l=>l.id===next.selectedLayerId))next.selectedLayerId=next.layers[0]?.id??''
 next.selectedLayerIds=next.selectedLayerIds.filter(id=>next.layers.some(l=>l.id===id));if(!next.selectedLayerIds.length)next.selectedLayerIds=[next.selectedLayerId]
 return {state:next,pending:pending.length||orderWarnings.length?{...inverse,entities:pending}:undefined}
}
