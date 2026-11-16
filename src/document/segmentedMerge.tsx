import { renderToStaticMarkup } from 'react-dom/server'
import { invertMatrix, type AffineMatrix } from '../canvas/layerCoordinates'
import { layerWorldPixelMatrix } from '../canvas/layerWorldMatrix'
import { CanvasScene } from '../canvas/CanvasScene'
import { serializeExport } from '../render/serializeExport'
import { exportSvgImage } from '../render/exportImage'
import { contentRevision } from '../ai/context/editorContext'
import { effectiveLayerState, layerParentId, layerSubtreeIds } from '../state/layerHierarchy'
import type { EditorState, Layer } from '../state/editor'
import type { MergeMode, MergeResult } from './groupTransforms'
export type MergeRasterizer = (svg: string, width: number, height: number) => Promise<string>
export type MergeOptions = { signal?: AbortSignal }
const isNormal = (layer: Layer) => layer.blendMode === '正常' || layer.blendMode === 'normal'
const abort = (signal?: AbortSignal) => { if (signal?.aborted) throw new Error('已取消合并，作品未更改') }
function siblings(state: EditorState, parent?: string): Layer[] {
 const children = state.layers.filter(layer => layerParentId(state.layers,layer.id) === parent)
 const order = parent && state.layers.find(layer => layer.id === parent)?.children
 return order ? [...order.map(id => children.find(layer => layer.id === id)).filter((layer):layer is Layer=>!!layer),...children.filter(layer => !order.includes(layer.id))] : children
}
export function selectedMergeRoots(state: EditorState, mode: Exclude<MergeMode,'flatten'>): string[] {
 let chosen = mode === 'visible' ? siblings(state).filter(layer=>effectiveLayerState(state.layers,layer.id).visible).map(layer=>layer.id) : [...new Set(state.selectedLayerIds.length ? state.selectedLayerIds : [state.selectedLayerId])]
 if (mode === 'down') {
  const current = state.layers.find(layer=>layer.id===state.selectedLayerId)
  if (!current) throw new Error('没有可合并的图层')
  const ordered=siblings(state,layerParentId(state.layers,current.id)), index=ordered.indexOf(current)
  const below=ordered.slice(index+1).find(layer=>effectiveLayerState(state.layers,layer.id).visible)
  if (!below) throw new Error('没有可向下合并的图层')
  chosen=[current.id,below.id]
 }
 const known = new Set(state.layers.map(layer=>layer.id))
 chosen=chosen.filter(id=>known.has(id))
 const highest=chosen.filter(id=>{let parent=layerParentId(state.layers,id);while(parent){if(chosen.includes(parent))return false;parent=layerParentId(state.layers,parent)}return true})
 if (!highest.length) throw new Error('没有可合并的图层')
 const ids=highest.flatMap(id=>layerSubtreeIds(state.layers,id))
 if(ids.some(id=>effectiveLayerState(state.layers,id).locked))throw new Error('图层或祖先已锁定，不能合并')
 return highest
}
function frozenParentInverse(state:EditorState,id:string,includeSelf=false):AffineMatrix{
 const parent=includeSelf?id:layerParentId(state.layers,id)
 if(!parent)return [1,0,0,1,0,0]
 const width=state.documentWidth,height=state.documentHeight,m=invertMatrix(layerWorldPixelMatrix(state.layers,parent,width,height))
 // Stored affine values map document percentages, while the shared helper uses physical pixels.
 return [m[0],m[1]*width/height,m[2]*height/width,m[3],m[4]*100/width,m[5]*100/height]
}
export async function encodeMergePng(svg:string,width:number,height:number):Promise<string>{
 const blob=await exportSvgImage(svg,{format:'png',width,height})
 return await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result as string);reader.onerror=()=>reject(new Error('合并资源编码失败'));reader.readAsDataURL(blob)})
}
function serialized(state:EditorState):string{
 const doc=new DOMParser().parseFromString(renderToStaticMarkup(<CanvasScene state={state} thumbnail/>),'image/svg+xml')
 const svg=doc.documentElement as unknown as SVGSVGElement
 if(!svg.viewBox?.baseVal)Object.defineProperty(svg,'viewBox',{value:{baseVal:{x:0,y:0,width:state.documentWidth,height:state.documentHeight}}})
 return serializeExport(svg,{range:'canvas'})
}
/** Preserve all compositing ancestors. Segments replace only contiguous selected siblings. */
export async function prepareSegmentedMerge(state:EditorState,mode:Exclude<MergeMode,'flatten'>,rasterize:MergeRasterizer=encodeMergePng,options:MergeOptions={}):Promise<MergeResult>{
 const roots=selectedMergeRoots(state,mode),selected=new Set(roots.flatMap(id=>layerSubtreeIds(state.layers,id)))
 // A clipping chain is an atomic compositing boundary. Refuse partial or
 // hidden-chain merges instead of dropping/rebinding its alpha dependency.
 for(const base of state.layers.filter(l=>state.layers.some(c=>c.clipBaseId===l.id))){
  const chain=state.layers.filter(l=>l.id===base.id||l.clipBaseId===base.id)
  if(chain.some(l=>selected.has(l.id)) && (!chain.every(l=>selected.has(l.id)) || chain.some(l=>!effectiveLayerState(state.layers,l.id).visible)))throw new Error('请同时选择可见基底及完整剪贴链后合并；当前作品未更改')
 }
 const repairReferenced=new Set(state.layers.flatMap(layer=>layer.repairSourceIds??[]))
 const ownTargetRemap=new Map<string,string>()
 const batch=`merge-batch-${crypto.randomUUID()}`,removed=new Set<string>(),updates=new Map<string,Layer>(),replacements=new Map<string,Layer>(),segments:Layer[]=[],clearedContent=new Set<string>(),clearedMasks=new Set<string>()
 const encode=async(view:EditorState)=>{abort(options.signal);const png=await rasterize(serialized(view),view.documentWidth,view.documentHeight);abort(options.signal);if(!/^data:image\/png;base64,/.test(png))throw new Error('合并未生成有效PNG资源');return png}
 const bakeRun=async(run:Layer[],clippingBase?:Layer)=>{
  if(!run.length)return
  const ids=new Set(run.flatMap(layer=>layerSubtreeIds(state.layers,layer.id))),ancestors=new Set<string>()
  for(const layer of run){let parent=layerParentId(state.layers,layer.id);while(parent){if(!ids.has(parent))ancestors.add(parent);parent=layerParentId(state.layers,parent)}}
  const single=run.length===1, outer=single?run[0]:null
  const layers=state.layers.filter(layer=>ids.has(layer.id)||ancestors.has(layer.id)).map(layer=>ancestors.has(layer.id)?{...layer,source:undefined,opacity:100,blendMode:'正常',adjustments:undefined}:single&&layer.id===outer?.id?{...layer,opacity:100,blendMode:'正常',adjustments:undefined}:layer)
  const view={...state,layers:layers.map(item=>({...item,...(item.id===clippingBase?.id?{blendMode:'正常'}:{}),repairSourceIds:undefined,repairCoverage:undefined})),documentBackground:'transparent',selectionVisible:false,canvasShapes:state.canvasShapes.filter(o=>ids.has(o.layerId)),canvasTexts:state.canvasTexts.filter(o=>ids.has(o.layerId)),brushStrokes:state.brushStrokes.filter(o=>ids.has(o.layerId)),layerMasks:Object.fromEntries(Object.entries(state.layerMasks).filter(([id])=>ids.has(id)))}
  const png=await encode(view),parent=layerParentId(state.layers,run[0].id)
  const layer:Layer={id:`merge-${crypto.randomUUID()}`,name:'合并片段（已栅格化）',className:'layer-art',mergeBatchId:batch,groupId:parent,transform:{kind:'transform',rect:{x:0,y:0,width:100,height:100},rotation:0,flipX:false,flipY:false,affine:frozenParentInverse(state,run[0].id)},source:png,contentWidth:state.documentWidth,contentHeight:state.documentHeight,visible:true,opacity:outer?.opacity??100,blendMode:clippingBase?.blendMode??outer?.blendMode??'正常',adjustments:outer?.adjustments}
  // Repair coverage participates in compositing of unselected sampled layers.
  if(outer?.repairCoverage){layer.repairCoverage=outer.repairCoverage;layer.repairSourceIds=outer.repairSourceIds}
  segments.push(layer);replacements.set(run[0].id,layer)
  for(const id of ids){
   const old=state.layers.find(item=>item.id===id)!
   const hidden=!effectiveLayerState(state.layers,id).visible
   const hasHidden=layerSubtreeIds(state.layers,id).some(child=>!effectiveLayerState(state.layers,child).visible)
   if(hidden)continue
   clearedContent.add(id)
   if(hasHidden){updates.set(id,{...old,source:undefined});continue}
   removed.add(id);clearedMasks.add(id)
  }
 }
 const visit=async(parent?:string)=>{
  let run:Layer[]=[]
  const flush=async()=>{await bakeRun(run);run=[]}
  const handledClips=new Set<string>()
  for(const layer of siblings(state,parent)){
   if(handledClips.has(layer.id))continue
   const clippingBase=layer.clipBaseId?state.layers.find(l=>l.id===layer.clipBaseId):undefined
   if(clippingBase&&selected.has(layer.id)){
    await flush()
    const chain=siblings(state,parent).filter(l=>l.id===clippingBase.id||l.clipBaseId===clippingBase.id)
    chain.forEach(l=>handledClips.add(l.id))
    await bakeRun(chain,clippingBase)
    continue
   }
   if(!effectiveLayerState(state.layers,layer.id).visible){await flush();continue}
   if(!selected.has(layer.id)){await flush();if(siblings(state,layer.id).length)await visit(layer.id);continue}
   const children=siblings(state,layer.id)
   if(children.length||layer.children){
    await flush()
    const hasHidden=layerSubtreeIds(state.layers,layer.id).some(id=>!effectiveLayerState(state.layers,id).visible)
    const repairBoundary=layerSubtreeIds(state.layers,layer.id).some(id=>repairReferenced.has(id)||!!state.layers.find(item=>item.id===id)?.repairCoverage)
    if(hasHidden||repairBoundary){
     const owns=!!layer.source||state.canvasShapes.some(o=>o.layerId===layer.id)||state.canvasTexts.some(o=>o.layerId===layer.id)||state.brushStrokes.some(o=>o.layerId===layer.id)
     if(owns){
      const ancestorIds=new Set<string>();let ancestor=layerParentId(state.layers,layer.id)
      while(ancestor){ancestorIds.add(ancestor);ancestor=layerParentId(state.layers,ancestor)}
      const rawLayers=state.layers.filter(item=>item.id===layer.id||ancestorIds.has(item.id)).map(item=>item.id===layer.id?{...item,children:undefined,opacity:100,blendMode:'正常',adjustments:undefined,repairCoverage:undefined,repairSourceIds:undefined}:{...item,source:undefined,opacity:100,blendMode:'正常',adjustments:undefined})
      const png=await encode({...state,layers:rawLayers,documentBackground:'transparent',layerMasks:{},canvasShapes:state.canvasShapes.filter(o=>o.layerId===layer.id),canvasTexts:state.canvasTexts.filter(o=>o.layerId===layer.id),brushStrokes:state.brushStrokes.filter(o=>o.layerId===layer.id),selectionVisible:false})
      const ownId=`merge-${crypto.randomUUID()}`
      const child:Layer={id:ownId,name:'组内容（已栅格化）',className:'layer-art',groupId:layer.id,mergeBatchId:batch,source:png,contentWidth:state.documentWidth,contentHeight:state.documentHeight,visible:true,opacity:100,blendMode:'正常',transform:{kind:'transform',rect:{x:0,y:0,width:100,height:100},rotation:0,flipX:false,flipY:false,affine:frozenParentInverse(state,layer.id,true)}}
      ownTargetRemap.set(layer.id,ownId)
      const updated={...layer,source:undefined,children:[...(layer.children??children.map(item=>item.id)),ownId]};updates.set(layer.id,updated);segments.push(child);clearedContent.add(layer.id)
     }
     await visit(layer.id)
    }else await bakeRun([layer])
    continue
   }else if(isNormal(layer)&&!layer.repairCoverage&&!repairReferenced.has(layer.id)){run.push(layer)}else{await flush();await bakeRun([layer])}
  }
  await flush()
 }
 await visit()
 if(!segments.length)throw new Error('所选范围没有可合并的可见内容，隐藏层已保留')
 abort(options.signal)
 const layers:Layer[]=[]
 for(const old of state.layers){
  const replacement=replacements.get(old.id)
  if(replacement)layers.push(replacement)
  if(removed.has(old.id))continue
  const current=updates.get(old.id)??old
  const children=current.children?.flatMap(id=>replacements.has(id)?[replacements.get(id)!.id,...(!removed.has(id)?[id]:[])]:removed.has(id)?[]:[id])
  const changed=children&&children.some((id,index)=>id!==current.children?.[index])||children&&children.length!==current.children?.length
  layers.push(changed?{...current,children}:current)
 }
 for(const segment of segments)if(!layers.some(layer=>layer.id===segment.id))layers.push(segment)
 const remapped=layers.map(layer=>{if(!layer.repairSourceIds)return layer;const refs=layer.repairSourceIds.map(id=>ownTargetRemap.get(id)??replacements.get(id)?.id??id);return refs.some((id,index)=>id!==layer.repairSourceIds![index])?{...layer,repairSourceIds:refs}:layer})
 const document:Partial<EditorState>={layers:remapped,selectedLayerId:segments[0].id,selectedLayerIds:segments.map(layer=>layer.id),canvasShapes:state.canvasShapes.filter(o=>!clearedContent.has(o.layerId)),canvasTexts:state.canvasTexts.filter(o=>!clearedContent.has(o.layerId)),brushStrokes:state.brushStrokes.filter(o=>!clearedContent.has(o.layerId)),layerMasks:Object.fromEntries(Object.entries(state.layerMasks).filter(([id])=>!clearedMasks.has(id))),sceneOrder:state.sceneOrder.filter(id=>![...state.canvasShapes,...state.canvasTexts,...state.brushStrokes].some(object=>object.id===id&&clearedContent.has(object.layerId)))}
 return {baseRevision:contentRevision(state),removedIds:[...removed],layer:segments[0],segments,document,flatten:false}
}
