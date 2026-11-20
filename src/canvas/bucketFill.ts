import type { EditorState } from '../state/editor'
import { effectiveLayerState } from '../state/layerHierarchy'
import { floodPixels, maskToSelection, type PixelImage } from './rasterTools'
import { combineSelection, selectionContains, type Selection, type SelectionPoint } from './selectionGeometry'
import { documentPointToLayerLocal } from './layerWorldMatrix'
import { hitMoveTarget } from './moveTargets'

/** All comparisons use the seed color; a selection clips the result without changing tool state. */
export function bucketSelection(image:PixelImage, point:SelectionPoint, tolerance:number, contiguous:boolean, selection?:Selection):Selection {
 const mask=floodPixels(image,point,tolerance)
 if(!contiguous){
  const seed=(Math.min(image.height-1,Math.floor(point.y/100*image.height))*image.width+Math.min(image.width-1,Math.floor(point.x/100*image.width)))*4
  for(let i=0;i<mask.length;i++){
   const transparent=image.data[i*4+3]===0&&image.data[seed+3]===0
   mask[i]=transparent||[0,1,2,3].every(c=>Math.abs(image.data[i*4+c]-image.data[seed+c])<=tolerance)?1:0
  }
 }
 const region=maskToSelection(mask,image.width,image.height)
 return selection?combineSelection(region,selection,'intersect'):region
}

/** Convert document-space geometry through the entire parent chain, including intrinsic sizes. */
export function selectionInLayer(state:EditorState, selection:Selection):Selection {
 const convert=(p:SelectionPoint)=>documentPointToLayerLocal(state.layers,state.selectedLayerId,p,state.documentWidth,state.documentHeight)
 const o=convert({x:0,y:0}),x=convert({x:100,y:0}),y=convert({x:0,y:100})
 const matrix:[number,number,number,number,number,number]=[(x.x-o.x)/100,(x.y-o.y)/100,(y.x-o.x)/100,(y.y-o.y)/100,o.x,o.y]
 const r=selection.rect,points=[{x:r.x,y:r.y},{x:r.x+r.width,y:r.y},{x:r.x,y:r.y+r.height},{x:r.x+r.width,y:r.y+r.height}].map(convert)
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y)
 return {...selection,rect:{x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)},path:{type:'affine',source:selection.path,matrix}}
}

export function fillShapeAt(state:EditorState,point:SelectionPoint){
 if(state.selectionVisible||state.toolOptions.fillSampleScope==='all')return undefined
 const layer=state.layers.find(l=>l.id===state.selectedLayerId)
 if(!layer||layer.smartObject||layer.children||!effectiveLayerState(state.layers,layer.id).visible||effectiveLayerState(state.layers,layer.id).locked)return undefined
 // Closed paths with an outline also count as interior targets for the bucket.
 const candidates={...state,canvasShapes:state.canvasShapes.map(s=>['rectangle','ellipse'].includes(s.kind)||s.kind==='path'&&s.path?.closed?{...s,fillEnabled:true}:s)}
 const hit=hitMoveTarget(candidates,point)
 if(hit?.kind!=='shape'||hit.layerId!==state.selectedLayerId)return undefined
 const shape=state.canvasShapes.find(s=>s.id===hit.id)
 if(!shape||!['rectangle','ellipse','path','boolean'].includes(shape.kind)||shape.kind==='path'&&!shape.path?.closed)return undefined
 const local=documentPointToLayerLocal(state.layers,layer.id,point,state.documentWidth,state.documentHeight)
 if(shape.selection&&!selectionContains(shape.selection.path,local))return undefined
 return shape
}
