import type { Layer } from './editor'
import { layerParentId } from './layerHierarchy'

/** Topmost-first sibling order; explicit group order is authoritative. */
export function clippingSiblings(layers:Layer[],id:string):Layer[] {
 const parentId=layerParentId(layers,id),parent=layers.find(l=>l.id===parentId),siblings=layers.filter(l=>layerParentId(layers,l.id)===parentId)
 return parent?.children ? [...parent.children.map(id=>siblings.find(l=>l.id===id)).filter((l):l is Layer=>!!l),...siblings.filter(l=>!parent.children!.includes(l.id))] : siblings
}
function validLink(layers:Layer[],layer:Layer):boolean {
 if(!layer.clipBaseId)return true
 const siblings=clippingSiblings(layers,layer.id),i=siblings.findIndex(l=>l.id===layer.id),b=siblings.findIndex(l=>l.id===layer.clipBaseId)
 return b>i && !siblings[b].clipBaseId && siblings.slice(i+1,b).every(l=>l.clipBaseId===layer.clipBaseId)
}
export function validateClipping(layers:Layer[]):void {
 for(const layer of layers) if(layer.clipBaseId && (typeof layer.clipBaseId!=='string'||!validLink(layers,layer))) throw new Error(`剪贴链无效：${layer.name}；基底必须为同组内连续链下方的非剪贴图层`)
}
/** Structural edits release links whose explicit base/order no longer exists. Never silently rebind. */
export function releaseInvalidClipping(layers:Layer[]):Layer[] {
 let result=layers
 // Bottom-up ensures a broken lower link also releases its upper chain.
 for(const layer of [...layers].reverse()) if(layer.clipBaseId&&!validLink(result,layer)) result=result.map(l=>l.id===layer.id?{...l,clipBaseId:undefined}:l)
 // Explicit children order can differ from flattened storage; converge without dependence on storage order.
 for(let i=0;i<layers.length;i++) {const invalid=result.filter(l=>l.clipBaseId&&!validLink(result,l));if(!invalid.length)break;const ids=new Set(invalid.map(l=>l.id));result=result.map(l=>ids.has(l.id)?{...l,clipBaseId:undefined}:l)}
 return result
}
export function createClipping(layers:Layer[],id:string):Layer[] {
 const siblings=clippingSiblings(layers,id),i=siblings.findIndex(l=>l.id===id),layer=siblings[i],below=siblings[i+1]
 if(!layer||!below)throw new Error('下方没有同组内的剪贴基底')
 if(layer.clipBaseId)return layers
 const baseId=below.clipBaseId??below.id
 const result=layers.map(l=>l.id===id?{...l,clipBaseId:baseId}:l)
 validateClipping(result)
 return result
}
