import { effectiveLayerState } from '../../state/layerHierarchy'
import type { EditorState, EditorAction } from '../../state/editor'
import { contentRevision } from '../context/editorContext'
import type { Selection } from '../../canvas/selectionGeometry'
import type { PixelImage } from '../../canvas/rasterTools'
import { rasterizeSelectionMask } from '../../canvas/selectionRaster'
import { resolveSampleScope, healPixels, patchPixels, repairDeltaPixels, repairCoveragePath, type SampleScope, type RetouchOptions } from '../../retouch/cloneHeal'
import { imageToPng } from '../../canvas/rasterTools'
import { editorReducer } from '../../state/editor'
export type RetouchTool='heal'|'clone'|'fill'
export type RetouchRequest={tool:RetouchTool;layerId:string;sampleScope:SampleScope;selection?: Selection;baseContentRevision:string;baseUndoLength:number;source?:{x:number;y:number;width:number;height:number};destination?:{x:number;y:number;width:number;height:number};points?:{x:number;y:number}[];options:RetouchOptions}
export function clipRetouchResult(before:PixelImage,after:PixelImage,selection?:Selection):PixelImage {
  if(before.width!==after.width||before.height!==after.height) throw new Error('修复结果尺寸与原图不一致')
  const clipped={width:after.width,height:after.height,data:new Uint8ClampedArray(after.data)}
  if(!selection) return clipped
  const mask=rasterizeSelectionMask(selection,after.width,after.height)
  for(let y=0;y<after.height;y++) for(let x=0;x<after.width;x++) {
    const i=(y*after.width+x)*4, a=(mask[y*after.width+x]??0)/255
    if(a>=1) continue
    for(let c=0;c<4;c++) clipped.data[i+c]=Math.round(before.data[i+c]*(1-a)+after.data[i+c]*a)
  }
  return clipped
}
// Selection is excluded from contentRevision: validate its complete current snapshot separately.
// Equal bounds do not imply equal path, inversion, raster alpha or feather authorization.
const finiteRange=(value:unknown,min:number,max:number,label:string)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error(`${label}必须是 ${min}–${max} 范围内的有限数字`)}
function validateRetouchGeometry(r:RetouchRequest){
  if(!r||!['heal','clone','fill'].includes(r.tool))throw new Error('不支持的修复工具')
  if(!['current','below','visible'].includes(r.sampleScope))throw new Error('不支持的修复采样范围')
  if(!r.options||typeof r.options!=='object'||Array.isArray(r.options))throw new Error('修复参数无效')
  finiteRange(r.options.size,Number.MIN_VALUE,2048,'修复尺寸')
  for(const key of ['hardness','opacity'] as const)if(r.options[key]!==undefined)finiteRange(r.options[key],0,100,key)
  if(r.options.aligned!==undefined&&typeof r.options.aligned!=='boolean')throw new Error('修复对齐参数必须是布尔值')
  if(r.points!==undefined){
    if(!Array.isArray(r.points)||r.points.length<1||r.points.length>4096)throw new Error('修复笔触必须包含 1–4096 个控制点')
    for(const point of r.points){if(!point||typeof point!=='object')throw new Error('修复控制点无效');finiteRange(point.x,0,100,'修复 x');finiteRange(point.y,0,100,'修复 y')}
  }
  if(r.tool==='heal'&&!r.points?.length)throw new Error('修复笔触不能为空')
  for(const rect of [r.source,r.destination])if(rect!==undefined){
    if(!rect||typeof rect!=='object')throw new Error('修复采样矩形无效')
    finiteRange(rect.x,0,100,'采样 x');finiteRange(rect.y,0,100,'采样 y');finiteRange(rect.width,Number.MIN_VALUE,100,'采样宽度');finiteRange(rect.height,Number.MIN_VALUE,100,'采样高度')
    if(rect.x+rect.width>100||rect.y+rect.height>100)throw new Error('修复采样矩形必须位于画板 0–100% 范围内')
  }
  if(r.tool!=='heal'&&(!r.source||!r.destination))throw new Error('仿制工具需要采样源和目标')
}
export function validateRetouch(state:EditorState,r:RetouchRequest){
  if(!r||typeof r!=='object')throw new Error('修复请求无效')
  const layer=state.layers.find(x=>x.id===r.layerId)
  if(!layer)throw new Error('修复目标不存在')
  if(effectiveLayerState(state.layers,r.layerId).locked)throw new Error('修复目标图层或祖先已锁定')
  validateRetouchGeometry(r)
  if(state.selectionVisible&&!r.selection)throw new Error('修复工具必须提供当前选区')
  if(JSON.stringify(r.selection??null)!==JSON.stringify(state.selectionVisible?state.selection:null))throw new Error('修复请求选区与文档当前选区不一致，请重新生成')
  if(r.baseContentRevision!==contentRevision(state)||r.baseUndoLength!==state.undoStack.length)throw new Error('修复结果已过期，请重新生成')
  const ids=resolveSampleScope(state.layers.map(layer=>{const effective=effectiveLayerState(state.layers,layer.id);return {id:layer.id,visible:effective.visible,locked:effective.locked}}),r.layerId,r.sampleScope)
  if(!ids.length)throw new Error('没有可用采样来源')
  return ids
}
export function retouchResultAction(state:EditorState,r:RetouchRequest,before:PixelImage,after:PixelImage):EditorAction {
  validateRetouch(state,r)
  // The trusted editor state, never request geometry, defines the publication boundary.
  const clippedAfter=clipRetouchResult(before,after,state.selectionVisible?state.selection:undefined)
  const delta=repairDeltaPixels(before,clippedAfter)
  const source=imageToPng(delta)
  return {type:'add-repair-layer',baseLayerId:r.layerId,source,name:r.tool==='heal'?'AI 修复':'AI 仿制',preserveSourceAlpha:true,baseContentRevision:r.baseContentRevision,baseUndoLength:r.baseUndoLength,repairCoverage:repairCoveragePath(before,clippedAfter),repairSourceIds:[r.layerId]}
}
export function applyRetouchResult(state:EditorState,r:RetouchRequest,before:PixelImage,after:PixelImage){return editorReducer(state,retouchResultAction(state,r,before,after))}
export function runRetouchPixels(image:PixelImage,r:RetouchRequest):PixelImage { validateRetouchGeometry(r); if(r.tool==='heal') return healPixels(image,r.points!,r.options);if(!r.source||!r.destination)throw new Error('仿制工具需要采样源和目标');return patchPixels(image,r.source,r.destination,r.options.hardness??0)}
