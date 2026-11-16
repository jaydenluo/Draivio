import { defaultCurves } from '../../adjustments/curves'
import { selectionToLayer } from '../../canvas/layerCoordinates'
import { layerPixelScale } from '../../document/documentGeometry'
import { effectiveLayerState, layerParentId } from '../../state/layerHierarchy'
import { neutralAdjustments, type EditorState, type Layer } from '../../state/editor'
import type { LayerMask } from '../../canvas/documentTypes'

export type DoubleExposureInput = { layerId?: string; resultId?: string; source?: string; name?: string }
export type DoubleExposureSettings = { subjectId: string; second: DoubleExposureInput; maskMode: 'alpha'|'existing'|'selection'; blendMode: 'screen'|'overlay'|'multiply'; opacity: number; dx: number; dy: number; scale: number; curveAmount: number; feather: number; inverted: boolean }
export const defaultDoubleExposureSettings = (): DoubleExposureSettings => ({ subjectId:'', second:{}, maskMode:'alpha', blendMode:'screen', opacity:65, dx:0, dy:0, scale:1, curveAmount:0, feather:0, inverted:false })
function image(state:EditorState,id:string):Layer {
 const layer=state.layers.find(l=>l.id===id)
 if(!layer)throw new Error('请选择有效图片图层')
 if(effectiveLayerState(state.layers,id).locked)throw new Error('图片或祖先已锁定')
 if(layerParentId(state.layers,id)||layer.children||layer.smartObject||layer.highPrecision||layer.clipBaseId||layer.documentSpace||layer.maskedCompositeSourceIds||layer.repairCoverage||layer.kind&&layer.kind!=='image'||!layer.source||layer.source==='fixture'||state.canvasTexts.some(t=>t.layerId===id)||state.canvasShapes.some(t=>t.layerId===id)||state.brushStrokes.some(t=>t.layerId===id))throw new Error('请使用独立的普通图片图层；文字、几何、组和高精度内容不会修改')
 const board=state.artboards.find(b=>b.id===state.activeArtboardId)
 if(state.artboards.length>1&&!board?.layerIds.includes(id))throw new Error('请选择当前画板图片')
 return layer
}
export function buildDoubleExposure(state:EditorState,settings:DoubleExposureSettings) {
 if(state.pixelFormat!=='rgba8'||state.colorModel==='cmyk')throw new Error('双重曝光仅支持 RGB 8 位文档')
 for(const [key,min,max] of [['opacity',0,100],['dx',-16384,16384],['dy',-16384,16384],['scale',.01,20],['curveAmount',0,1],['feather',0,64]] as const)if(!Number.isFinite(settings[key])||settings[key]<min||settings[key]>max)throw new Error(`双重曝光参数 ${key} 无效`)
 if(!['alpha','existing','selection'].includes(settings.maskMode)||!['screen','overlay','multiply'].includes(settings.blendMode)||typeof settings.inverted!=='boolean')throw new Error('双重曝光模式无效')
 const subject=image(state,settings.subjectId),input=settings.second
 if([input.layerId,input.resultId,input.source].filter(Boolean).length!==1)throw new Error('请选择或导入第二图；不会自动生成或发起付费请求')
 let second:Layer
 if(input.layerId){if(input.layerId===subject.id)throw new Error('主体与第二图需分别选择');second=image(state,input.layerId)}
 else {const result=input.resultId?state.aiResults.find(r=>r.id===input.resultId&&r.status==='success'):undefined;const source=result?.source??input.source;if(!source||!/^data:image\//.test(source))throw new Error('第二图必须是已下载结果或本地图片');second={id:'input',name:input.name??'第二图',kind:'image',className:'layer-art',source,visible:true,opacity:100,blendMode:'正常'}}
 const groupId=`double-${crypto.randomUUID()}`,subjectId=`${groupId}-subject`,secondId=`${groupId}-second`
 const base:Layer={...structuredClone(subject),id:subjectId,name:`主体 · ${subject.name}`,groupId,visible:true,locked:false,clipBaseId:undefined}
 const curves=defaultCurves();curves.rgb=[{x:0,y:0},{x:.25,y:.25-.08*settings.curveAmount},{x:.75,y:.75+.08*settings.curveAmount},{x:1,y:1}]
 if(settings.curveAmount)base.adjustments={...neutralAdjustments,...base.adjustments,curves}
 const overlay:Layer={...structuredClone(second),id:secondId,name:`第二图 · ${second.name}`,groupId,visible:true,locked:false,clipBaseId:subjectId,opacity:settings.opacity,blendMode:settings.blendMode,transform:{kind:'transform',rect:{x:(1-settings.scale)*50+settings.dx/state.documentWidth*100,y:(1-settings.scale)*50+settings.dy/state.documentHeight*100,width:settings.scale*100,height:settings.scale*100},rotation:0,flipX:false,flipY:false}}
 const group:Layer={id:groupId,name:'双重曝光（可编辑）',kind:'group',className:'layer-group',visible:true,opacity:100,blendMode:'正常',children:[secondId,subjectId]}
 const masks:Record<string,LayerMask>={...state.layerMasks}
 if(state.layerMasks[second.id])masks[secondId]=structuredClone(state.layerMasks[second.id])
 let mask:LayerMask|undefined
 if(settings.maskMode==='existing'){if(!state.layerMasks[subject.id])throw new Error('主体没有图层蒙版，请手动建立蒙版或选择当前选区');mask=structuredClone(state.layerMasks[subject.id])}
 else if(settings.maskMode==='selection'){if(!state.selectionVisible)throw new Error('请先建立主体轮廓选区');mask={selection:selectionToLayer(state.selection,subject.transform,state.documentWidth,state.documentHeight),strokes:[],applied:true,inverted:false}}
 else if(state.layerMasks[subject.id])mask=structuredClone(state.layerMasks[subject.id])
 if(mask){if(mask.selection)mask.selection={...mask.selection,feather:settings.feather/layerPixelScale(subject,state.documentWidth,state.documentHeight).mean};mask.applied=true;mask.inverted=settings.inverted?!mask.inverted:mask.inverted;masks[subjectId]=mask}
 else if(settings.inverted||settings.feather)throw new Error('羽化/反转需要主体蒙版或选区；源透明度模式不自动分割')
 const hidden=new Set([subject.id,...(input.layerId?[input.layerId]:[])])
 const layers=[group,overlay,base,...state.layers.map(l=>hidden.has(l.id)?{...l,visible:false}:l)]
 const artboards=state.artboards.map(b=>b.id===state.activeArtboardId?{...b,layerIds:[groupId,secondId,subjectId,...b.layerIds]}:b)
 return {groupId,subjectId,secondId,document:{...state,layers,layerMasks:masks,artboards,selectedLayerId:secondId,selectedLayerIds:[secondId]}}
}
