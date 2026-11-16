import {editorReducer,neutralAdjustments,type EditorState,type Layer} from '../../state/editor'
import {processPortrait,validatePortraitSettings,type PortraitMasks,type PortraitSettings} from './portrait'
import {decodePixels,encodePixels} from '../maskedEdit/workflow'
import {contentRevision} from '../context/editorContext'
import {effectiveLayerState,layerParentId} from '../../state/layerHierarchy'
import {validateFilterSelection} from '../../filters/selection'
export type PortraitRegions={documentId:string;base:string;layerId:string;masks:PortraitMasks}
export type PortraitCandidate={documentId:string;base:string;layerId:string;state:EditorState;preview:string}
function target(state:EditorState){
 const layer=state.layers.find(l=>l.id===state.selectedLayerId)
 if(state.pixelFormat!=='rgba8'||state.colorModel==='cmyk')throw new Error('人像精修仅支持RGB8工作副本')
 if(!layer||effectiveLayerState(state.layers,layer.id).locked||!effectiveLayerState(state.layers,layer.id).visible)throw new Error('人像目标不存在、隐藏或已锁定')
 if(!layer.source||!/^data:image\//.test(layer.source)||layerParentId(state.layers,layer.id)||layer.children||layer.smartObject||layer.highPrecision||layer.warpRecipe||layer.clipBaseId||layer.documentSpace||layer.maskedCompositeSourceIds||layer.repairCoverage||layer.adjustments&&JSON.stringify(layer.adjustments)!==JSON.stringify(neutralAdjustments)||layer.smartFilters?.items.length||layer.effects||state.layerMasks[layer.id]?.applied||state.canvasTexts.some(t=>t.layerId===layer.id)||state.canvasShapes.some(t=>t.layerId===layer.id)||state.brushStrokes.some(t=>t.layerId===layer.id)||layer.kind&&layer.kind!=='image')throw new Error('请选择本地顶层普通人像图片工作副本；带蒙版、调整或特殊内容请先显式合成副本')
 if(state.artboards.length>1&&!state.artboards.find(b=>b.id===state.activeArtboardId)?.layerIds.includes(layer.id))throw new Error('人像不属于当前画板')
 return layer
}
export function capturePortraitRegions(state:EditorState,documentId:string,masks:PortraitMasks):PortraitRegions{
 const layer=target(state)
 for(const key of ['person','skin','eyes'] as const)validateFilterSelection(masks[key])
 if(masks.protect)validateFilterSelection(masks.protect)
 return {documentId,base:contentRevision(state),layerId:layer.id,masks:structuredClone(masks)}
}
function current(regions:Pick<PortraitRegions,'documentId'|'base'|'layerId'>,state:EditorState,documentId:string){return regions.documentId===documentId&&regions.base===contentRevision(state)&&regions.layerId===state.selectedLayerId}
export async function createPortraitCandidate(state:EditorState,documentId:string,regions:PortraitRegions,settings:PortraitSettings,options:{signal?:AbortSignal;io?:{decode:typeof decodePixels;encode:typeof encodePixels}}={}):Promise<PortraitCandidate>{
 if(!current(regions,state,documentId))throw new Error('人像分区已过期，请重新捕获')
 const layer=target(state),io=options.io??{decode:decodePixels,encode:encodePixels}
 validatePortraitSettings(settings)
 const image=await io.decode(layer.source!),result=await processPortrait(image,regions.masks,settings,{signal:options.signal})
 try {
 const layers:Layer[]=[],layerMasks={...state.layerMasks},groupId=`portrait-${crypto.randomUUID()}`
 // Cumulative snapshots are deliberate: only the final stage is visible, so
 // source alpha is never compounded by overlapping semi-transparent layers.
 const stages=result.stages.length?result.stages:[{name:'原样（所有步骤关闭）',image:result.image,selection:regions.masks.person}]
 for(let i=0;i<stages.length;i++){
  if(options.signal?.aborted)throw new DOMException('人像精修已取消','AbortError')
  const stage=stages[i],id=`${groupId}-${i}`,source=io.encode(stage.image)
  layers.push({...structuredClone(layer),id,name:`人像 ${i+1} · ${stage.name}（累积快照）`,source,thumbnail:source,visible:i===stages.length-1,locked:false})
  // Store the exact captured editable region without reapplying its feather a
  // second time; the cumulative PNG already contains one mask blend.
  layerMasks[id]={selection:structuredClone(stage.selection),strokes:[],applied:false,inverted:false}
 }
 const last=layers.at(-1)!,snapshots=layers.reverse(),targetIndex=state.layers.findIndex(l=>l.id===layer.id)
 // Replace the source at its existing stack position. Prepending globally
 // would lift the portrait over unrelated foreground artwork and other people.
 const nextLayers=[...state.layers.slice(0,targetIndex),...snapshots,{...layer,visible:false},...state.layers.slice(targetIndex+1)]
 const ids=snapshots.map(l=>l.id),artboards=state.artboards.map(b=>{
  const index=b.layerIds.indexOf(layer.id)
  return b.id===state.activeArtboardId?{...b,layerIds:index>=0?[...b.layerIds.slice(0,index),...ids,...b.layerIds.slice(index)]:[...b.layerIds]}:b
 })
 // Store all four captured masks as hidden empty control layers using existing
 // validated source/layerMasks project fields, not unchecked custom metadata.
 for(const [name,selection] of Object.entries(regions.masks))if(typeof selection==='object'){
  const id=`${groupId}-region-${name}`;nextLayers.push({id,name:`人像分区 · ${name} · 手工确认`,kind:'image',className:'layer-art',visible:false,locked:true,opacity:100,blendMode:'正常'})
  layerMasks[id]={selection:structuredClone(selection),strokes:[],applied:false,inverted:false}
  for(const board of artboards)if(board.id===state.activeArtboardId)board.layerIds.push(id)
 }
 if(options.signal?.aborted)throw new DOMException('人像精修已取消','AbortError')
 return {documentId,base:regions.base,layerId:layer.id,preview:last.source!,state:{...state,layers:nextLayers,layerMasks,artboards,selectedLayerId:last.id,selectedLayerIds:[last.id]}}
 }finally{result.image.data.fill(0);for(const stage of result.stages)stage.image.data.fill(0);image.data.fill(0)}
}
export function portraitCanCommit(candidate:PortraitCandidate,state:EditorState,documentId:string){return current(candidate,state,documentId)}
export function adoptPortraitCandidate(candidate:PortraitCandidate,state:EditorState,documentId:string){
 if(!portraitCanCommit(candidate,state,documentId))throw new Error('人像预览已过期，请重新确认分区')
 target(state)
 return editorReducer(state,{type:'apply-edit-plan',document:candidate.state})
}
