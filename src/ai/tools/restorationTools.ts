import type { EditorState,AIResult } from '../../state/editor'
import type { PixelImage } from '../../canvas/rasterTools'
import { requestJson } from '../../lib/request'
import { captureEditorContext } from '../context/editorContext'
import { decodePixels,encodePixels } from '../maskedEdit/workflow'
import { tiledInference,type TileInference,type TiledOptions } from '../imaging/tiledInference'
export type RestorationMode='size'|'detail'|'deblur'
export type RestorationSettings={scale:2|4;mode:RestorationMode;backend:string}
export function restorationWarning(mode:RestorationMode):string{return mode==='size'?'尺寸增强增加输出像素，不保证增加可辨识信息。':'生成式修复可能改写文字、人脸和重复纹理；请并排核对原图，不代表还原真实信息。'}
const check=(signal?:AbortSignal)=>{if(signal?.aborted)throw new DOMException('增强已取消，原图未改变','AbortError')}
/** Backend contract only: no interpolation or demo fallback is advertised as model inference. */
export async function requestRestorationTile(options:{endpoint:string;model:string;mode:RestorationMode;scale:2|4;image:PixelImage;signal?:AbortSignal}):Promise<PixelImage>{
 let url:URL;try{url=new URL(options.endpoint)}catch{throw new Error('未配置有效的修复模型后端')}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash||!options.model.trim())throw new Error('修复后端必须为无内嵌凭据的 HTTP(S) 地址并指定模型')
 if(options.scale!==2&&options.scale!==4)throw new Error('仅支持 2 倍或 4 倍增强')
 if(!['size','detail','deblur'].includes(options.mode))throw new Error('修复模式无效')
 const response=await requestJson(url.href,{method:'POST',body:{protocol:'draivio-restoration-v1',model:options.model,mode:options.mode,scale:options.scale,image:{width:options.image.width,height:options.image.height,data:Array.from(options.image.data)}},signal:options.signal,timeoutMs:120000,maxResponseBytes:32*1024*1024})
 check(options.signal)
 if(response.status<200||response.status>=300)throw new Error(response.status===507||response.status===413?'修复后端显存或内存不足，请减小分块后重试':`修复后端失败（${response.status}），未生成候选`)
 const value=response.body as {width:number;height:number;data:number[]}
 if(!value||value.width!==options.image.width*options.scale||value.height!==options.image.height*options.scale||!Array.isArray(value.data)||value.data.length!==value.width*value.height*4||value.data.some(v=>!Number.isInteger(v)||v<0||v>255))throw new Error('修复后端返回像素或尺寸无效')
 return {width:value.width,height:value.height,data:new Uint8ClampedArray(value.data)}
}
/** Read-only execution. The caller dispatches add-ai-result only after its current-document guard passes. */
export async function generateRestoration(state:EditorState,documentId:string,settings:RestorationSettings,infer:TileInference,options:TiledOptions&{io?:{decode:typeof decodePixels;encode:typeof encodePixels}}={}):Promise<AIResult>{
 if(!settings.backend.trim())throw new Error('未配置真实修复模型后端，不提供模拟修复')
 if(!['size','detail','deblur'].includes(settings.mode))throw new Error('修复模式无效')
 const context=captureEditorContext(state,documentId,'layer'),target=state.layers.find(l=>l.id===context.targetLayerId)!
 if(!target.source)throw new Error('请先选择有像素来源的图层')
 check(options.signal);const io=options.io??{decode:decodePixels,encode:encodePixels},original=await io.decode(target.source);check(options.signal)
 const pixels=await tiledInference(original,settings.scale,infer,options),source=io.encode(pixels);check(options.signal)
 return {id:`restoration-${crypto.randomUUID()}`,source,thumbnail:source,prompt:restorationWarning(settings.mode),model:`${settings.backend} · ${settings.mode==='size'?'尺寸增强':settings.mode==='detail'?'生成式细节补全':'去模糊修复'} · ${settings.scale}x`,provider:settings.backend,size:`${pixels.width} × ${pixels.height}`,createdAt:new Date().toISOString(),status:'success',favorite:false,adopted:false,request:{restoration:{width:pixels.width,height:pixels.height,scale:settings.scale,mode:settings.mode,backend:settings.backend},mode:'edit',intent:'edit',prompt:restorationWarning(settings.mode),sourceLayerId:target.id,selection:null,parameters:{...state.composerParameters,size:`${pixels.width}x${pixels.height}`},context,reference:{source:target.source,thumbnail:target.thumbnail,layerId:target.id}}}
}
