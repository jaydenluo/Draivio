import type { EditorState } from '../state/editor'
import { layerCanvasBounds } from '../document/alignment'
import { effectiveLayerState, layerSubtreeIds, layerParentId } from '../state/layerHierarchy'
import { createSnapIndex, snapBounds, type SnapHits, type SnapIndex } from '../document/snapping'
import type { TransformDraft } from './TransformOverlay'
import { resizeTransformRect } from './transformGeometry'
export function editorSnapIndex(state: EditorState, id: string): SnapIndex {
 const candidate = state.artboards.length > 1 ? state.artboards.find(board => board.id === state.activeArtboardId) : undefined
 const board = candidate
 const allowed = board ? new Set(board.layerIds.flatMap(id => layerSubtreeIds(state.layers,id))) : null
 const exclude = new Set(layerSubtreeIds(state.layers,id))
 let parent = layerParentId(state.layers,id); while(parent && !exclude.has(parent)){ exclude.add(parent); parent=layerParentId(state.layers,parent) }
 return createSnapIndex({objects:state.layers.filter(l=>(!allowed || allowed.has(l.id))&&!exclude.has(l.id)&&effectiveLayerState(state.layers,l.id).visible).map(l=>({id:l.id,bounds:layerCanvasBounds(state,l.id)})),guides:state.guideSettings.guidesVisible?state.guideSettings.guides:[],canvas:{width:state.documentWidth,height:state.documentHeight},grid:state.guideSettings.grid})
}
/** Solve corrections through the same world matrix and resize geometry used by preview.
 * Local resize keeps its opposite handle fixed; a numerical Jacobian maps world AABB
 * edges through parent rotations/affines without writing an AABB as a local rect.
 */
export function snapLayerTransform(state:EditorState,id:string,draft:TransformDraft,index:SnapIndex,handle:string,altKey:boolean,previous?:SnapHits):{draft:TransformDraft;hits:SnapHits} {
 const bounds=(d:TransformDraft)=>layerCanvasBounds({...state,layers:state.layers.map(l=>l.id===id?{...l,transform:d}:l)},id)
 const original=bounds(draft)
 const result=snapBounds(index,original,{zoomPercent:state.zoom,mode:handle==='move'?'move':'resize',handle,altKey,enabled:state.guideSettings.snapEnabled,previous})
 const axes=(['x','y'] as const).filter(a=>result.hits[a])
 if(!axes.length)return {draft,hits:result.hits}
 const metric=(b:typeof original,a:'x'|'y')=>b[a]+(handle==='move'?0:result.hits[a]?.anchor==='end'?(a==='x'?b.width:b.height):0)
 const target=axes.map(a=>metric(result.rect,a))
 const change=(d:TransformDraft,dx:number,dy:number):TransformDraft=>({...d,rect:handle==='move'?{...d.rect,x:d.rect.x+dx,y:d.rect.y+dy}:resizeTransformRect(d.rect,handle,{x:dx,y:dy},d.rotation,false,state.documentWidth/state.documentHeight)})
 let current=draft
 for(let iteration=0;iteration<4;iteration++){
  const b=bounds(current),error=axes.map((a,i)=>target[i]-metric(b,a));if(Math.max(...error.map(Math.abs))<1e-5)break
  const step=.001,bx=bounds(change(current,step,0)),by=bounds(change(current,0,step))
  const j=axes.map(a=>[(metric(bx,a)-metric(b,a))/step,(metric(by,a)-metric(b,a))/step])
  let dx=0,dy=0
  if(axes.length===2){const det=j[0][0]*j[1][1]-j[0][1]*j[1][0];if(Math.abs(det)<1e-8)break;dx=(error[0]*j[1][1]-error[1]*j[0][1])/det;dy=(j[0][0]*error[1]-j[1][0]*error[0])/det}
  else {const norm=j[0][0]**2+j[0][1]**2;if(norm<1e-8)break;dx=error[0]*j[0][0]/norm;dy=error[0]*j[0][1]/norm}
  current=change(current,dx,dy)
 }
 return {draft:current,hits:result.hits}
}
