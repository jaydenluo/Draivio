import type { EditorState, Layer } from '../state/editor'
import { effectiveLayerState, layerParentId, layerSubtreeIds } from '../state/layerHierarchy'
import { validateClipping } from '../state/clipping'
import { layerWorldPixelMatrix } from '../canvas/layerWorldMatrix'
import { invertMatrix, multiplyMatrices, type AffineMatrix } from '../canvas/layerCoordinates'

export type LayerPlacement = 'before' | 'after' | 'inside'

/** An identity group at the same parent keeps all members in their original coordinate system. */
export function groupSelectedLayers(state: EditorState, selectedIds: string[]): EditorState {
 const selected=new Set(selectedIds.filter(id=>state.layers.some(l=>l.id===id)))
 const roots=state.layers.filter(l=>selected.has(l.id)&&!state.layers.some(parent=>parent.id!==l.id&&selected.has(parent.id)&&layerSubtreeIds(state.layers,parent.id).includes(l.id)))
 if(!roots.length)return state
 if(roots.some(l=>layerSubtreeIds(state.layers,l.id).some(id=>effectiveLayerState(state.layers,id).locked)))throw new Error('所选图层或其祖先已锁定，请先解锁')
 const parent=layerParentId(state.layers,roots[0].id)
 if(roots.some(l=>layerParentId(state.layers,l.id)!==parent))throw new Error('请选择同一图层组内的图层进行编组')
 const boardOf=(id:string)=>state.artboards.find(b=>b.layerIds.includes(id))?.id
 if(state.artboards.length>1&&roots.some(l=>boardOf(l.id)!==boardOf(roots[0].id)))throw new Error('请选择同一画板内的图层进行编组')
 const direct=state.layers.filter(l=>layerParentId(state.layers,l.id)===parent)
 const declared=parent?state.layers.find(l=>l.id===parent)?.children??[]:[]
 const siblings=[...declared.filter(id=>direct.some(l=>l.id===id)),...direct.filter(l=>!declared.includes(l.id)).map(l=>l.id)]
 const rootIds=new Set(roots.map(l=>l.id)),children=siblings.filter(id=>rootIds.has(id))
 const first=siblings.indexOf(children[0]),last=siblings.indexOf(children.at(-1)!)
 if(siblings.slice(first,last+1).some(id=>!rootIds.has(id)))throw new Error('请先将所选图层排在一起，再编组以保持叠放效果')
 if(state.layers.some(l=>l.clipBaseId&&rootIds.has(l.id)!==rootIds.has(l.clipBaseId)))throw new Error('请选择完整的剪贴链后编组')
 const id=`group-${crypto.randomUUID()}`,group:Layer={id,name:'图层组',className:'layer-group',kind:'group',visible:true,opacity:100,blendMode:'正常',children,groupId:parent,collapsed:false}
 const nextSiblings=[...siblings.slice(0,first),id,...siblings.slice(last+1)]
 const layers=state.layers.map(l=>rootIds.has(l.id)?{...l,groupId:id}:l.id===parent?{...l,children:nextSiblings}:l)
 layers.splice(layers.findIndex(l=>l.id===children[0]),0,group)
 return {...state,layers,selectedLayerId:id,selectedLayerIds:[id],notice:'已创建图层组'}
}
/** Scene order is the group's explicit child order, with legacy unlisted children appended. */
export function orderedLayerTree(layers: Layer[]): Array<{layer: Layer; depth: number}> {
 const result: Array<{layer:Layer;depth:number}> = [], visited=new Set<string>()
 const visit=(parent:string|undefined,depth:number)=>{
  const children=layers.filter(l=>layerParentId(layers,l.id)===parent)
  const explicit=parent?layers.find(l=>l.id===parent)?.children??[]:[]
  const order=[...explicit.flatMap(id=>children.filter(l=>l.id===id)),...children.filter(l=>!explicit.includes(l.id))]
  for(const layer of order){if(visited.has(layer.id))continue;visited.add(layer.id);result.push({layer,depth});if(!layer.collapsed)visit(layer.id,depth+1)}
 }
 visit(undefined,0);return result
}

/** Reorder by stable IDs, preserving the entire subtree and physical geometry when changing parent. */
export function placeLayer(state: EditorState,id:string,targetId:string,placement:LayerPlacement):EditorState {
 if(id===targetId)return state
 const source=state.layers.find(l=>l.id===id),target=state.layers.find(l=>l.id===targetId)
 if(!source||!target)return state
 const subtree=new Set(layerSubtreeIds(state.layers,id))
 if(subtree.has(targetId))throw new Error('不能将图层组拖入自身或子图层')
 if([...subtree].some(key=>effectiveLayerState(state.layers,key).locked)||effectiveLayerState(state.layers,targetId).locked)throw new Error('请先解锁图层或图层组')
 if(placement==='inside'&&!target.children)throw new Error('只能拖入图层组')
 const oldParent=layerParentId(state.layers,id),parent=placement==='inside'?targetId:layerParentId(state.layers,targetId)
 const boardOf=(key:string)=>state.artboards.find(b=>b.layerIds.some(root=>layerSubtreeIds(state.layers,root).includes(key)))?.id
 if(state.artboards.length>1&&boardOf(id)!==boardOf(targetId))throw new Error('请使用移动到画板操作')
 if(source.clipBaseId||state.layers.some(l=>l.clipBaseId===id))throw new Error('请先释放剪贴蒙版，再移动剪贴链中的图层')
 let moved:Layer={...source,groupId:parent}
 if(parent!==oldParent){
  const world=layerWorldPixelMatrix(state.layers,id,state.documentWidth,state.documentHeight)
  const parentWorld:AffineMatrix=parent?layerWorldPixelMatrix(state.layers,parent,state.documentWidth,state.documentHeight):[1,0,0,1,0,0]
  const m=multiplyMatrices(invertMatrix(parentWorld),world),w=state.documentWidth,h=state.documentHeight,cw=source.contentWidth??w,ch=source.contentHeight??h
  moved={...moved,transform:{kind:'transform',rect:{x:0,y:0,width:100,height:100},rotation:0,flipX:false,flipY:false,affine:[m[0]*cw/w,m[1]*cw/h,m[2]*ch/w,m[3]*ch/h,m[4]*100/w,m[5]*100/h]}}
 }
 const originals=state.layers
 let remaining=originals.filter(l=>!subtree.has(l.id)).map(l=>l.children?{...l,children:l.children.filter(key=>key!==id)}:l)
 const targetIndex=remaining.findIndex(l=>l.id===targetId)
 const targetTree=new Set(layerSubtreeIds(remaining,targetId))
 const insertion=placement==='before'?targetIndex:placement==='inside'?targetIndex+1:Math.max(...remaining.flatMap((l,i)=>targetTree.has(l.id)?[i]:[]))+1
 const tree=originals.filter(l=>subtree.has(l.id)).map(l=>l.id===id?moved:l)
 remaining.splice(insertion,0,...tree)
 if(parent){
  const siblings=originals.filter(l=>layerParentId(originals,l.id)===parent&&l.id!==id)
  const declared=remaining.find(l=>l.id===parent)?.children??[]
  const order=[...declared.filter(key=>siblings.some(l=>l.id===key)),...siblings.filter(l=>!declared.includes(l.id)).map(l=>l.id)]
  const index=placement==='inside'?0:order.indexOf(targetId)+(placement==='after'?1:0)
  order.splice(Math.max(0,index),0,id)
  remaining=remaining.map(l=>l.id===parent?{...l,children:order,collapsed:false}:l)
 }
 try { validateClipping(remaining) } catch { throw new Error('不能插入剪贴链中，请先释放剪贴蒙版') }
 return {...state,layers:remaining,selectedLayerId:id,selectedLayerIds:[id]}
}
