import type { ComposerParameters, EditorState } from '../state/editor'
import { outputFormats, type OutputRatio } from './outputFormats'
import { dimensionError } from '../document/documentGeometry'
import { getModelsForSource, getRuntimeConnections } from './modelSources'
import { resolveGenerationOptions } from './generationOptions'
import { negotiateGenerativeRoute } from '../ai/tools/generativeTools'

export type ImageOverrides = { count?: number; ratio?: OutputRatio; size?: string; model?: string; quality?: 'auto'|'low'|'medium'|'high'; strength?: number }
export type ChatImageTask = { sendSize: boolean; sourceId: string; parameters: ComposerParameters; overrides: ImageOverrides; quality?: ImageOverrides['quality']; defaults: ComposerParameters }
export function parseImageOverrides(value: unknown): ImageOverrides {
 if(value===undefined)return {}
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('图片参数格式无效')
 const v=value as Record<string,unknown>
 if(Object.keys(v).some(k=>!['count','ratio','size','model','quality','strength'].includes(k)))throw new Error('图片参数包含未支持的字段，请明确要求')
 if(v.count!==undefined&&(!Number.isInteger(v.count)||Number(v.count)<1||Number(v.count)>8))throw new Error('一次生成数量必须为1–8张')
 if(v.ratio!==undefined&&v.ratio!=='auto'&&!outputFormats.some(f=>f.ratio===v.ratio))throw new Error('暂不支持此图片比例，请指定像素尺寸')
 if(v.size!==undefined&&(typeof v.size!=='string'||!(v.size==='auto'||/^\d+\s*[xX×]\s*\d+$/.test(v.size))))throw new Error('图片尺寸格式无效')
 if(v.model!==undefined&&(typeof v.model!=='string'||!v.model.trim()))throw new Error('请明确图片模型名称')
 if(v.quality!==undefined&&!['auto','low','medium','high'].includes(String(v.quality)))throw new Error('图片质量参数无效')
 if(v.strength!==undefined&&(typeof v.strength!=='number'||!Number.isFinite(v.strength)||v.strength<0||v.strength>1))throw new Error('修改强度必须为0–1')
 if(typeof v.size==='string'&&v.size!=='auto'){
  const [width,height]=v.size.split(/[xX×]/).map(Number),error=dimensionError(width,height)
  if(error)throw new Error(error)
 }
 return {...v} as ImageOverrides
}
export function resolveChatImageParameters(defaults: ComposerParameters, raw: ImageOverrides, canvas?: {width:number;height:number}): ComposerParameters {
 const overrides=parseImageOverrides(raw),resolved={...defaults}
 if(overrides.count!==undefined)resolved.count=`${overrides.count} 张`
 if(overrides.model)resolved.model=overrides.model
 if(overrides.strength!==undefined)resolved.strength=`强度 ${overrides.strength*100}%`
 if(canvas){
  if(overrides.size!==undefined||overrides.ratio!==undefined)throw new Error('局部修图保持原画布尺寸；如需改变尺寸，请单独调整画布后再修改')
  resolved.size=`${canvas.width} × ${canvas.height}`
  resolved.ratio=outputFormats.find(f=>{const [w,h]=f.ratio.split(':').map(Number);return w*canvas.height===h*canvas.width})?.ratio??'auto'
  return resolved
 }
 if(overrides.size!==undefined){
  if(overrides.size==='auto'){
   if(overrides.ratio&&overrides.ratio!=='auto')throw new Error('自动尺寸无法保证明确比例，请指定像素尺寸或只保留比例要求')
   resolved.size='auto';resolved.ratio='auto'
  }
  else{
   const [width,height]=overrides.size.split(/[xX×]/).map(Number)
   if(overrides.ratio&&overrides.ratio!=='auto'){
    const [w,h]=overrides.ratio.split(':').map(Number)
    if(width*h!==height*w)throw new Error('像素尺寸与要求的比例不一致，请明确其中一种')
   }
   resolved.size=`${width} × ${height}`
   resolved.ratio=outputFormats.find(f=>{const [w,h]=f.ratio.split(':').map(Number);return width*h===height*w})?.ratio??'auto'
  }
 }else if(overrides.ratio!==undefined&&(overrides.ratio!==defaults.ratio||defaults.size==='auto')){
  resolved.ratio=overrides.ratio
  resolved.size=overrides.ratio==='auto'?'auto':outputFormats.find(f=>f.ratio===overrides.ratio)!.sizes[0]
 }
 return resolved
}
export function prepareChatImageTask(state: EditorState, mode:'generate'|'edit', target:string, raw: ImageOverrides, hasUpload = false): ChatImageTask {
 const overrides=parseImageOverrides(raw)
 let sourceId=state.composerSourceId
 const parameters=resolveChatImageParameters(state.composerParameters,overrides,mode==='edit'&&target!=='upload'?{width:state.documentWidth,height:state.documentHeight}:undefined)
 if(overrides.model){
  const matches=getRuntimeConnections().filter(c=>c.enabled).flatMap(c=>getModelsForSource(c.id).filter(m=>m.code===overrides.model||m.displayName===overrides.model).map(m=>({sourceId:c.id,model:m})))
  const local=matches.filter(m=>m.sourceId===sourceId),choices=local.length?local:matches
  if(choices.length!==1)throw new Error('指定的图片模型未配置或名称不唯一，请在聊天框选择模型')
  sourceId=choices[0].sourceId;parameters.model=choices[0].model.displayName
 }
 const connection=getRuntimeConnections().find(c=>c.id===sourceId&&c.enabled)
 const model=getModelsForSource(sourceId).find(m=>m.displayName===parameters.model)?.code
 if(!connection||!model)throw new Error('请先在聊天框配置可用的图片模型')
 const options={...resolveGenerationOptions(connection,model),...(overrides.quality?{quality:overrides.quality}:{})}
 if((overrides.size!==undefined||overrides.ratio!==undefined)&&!options.sendSize)throw new Error('此服务不发送尺寸参数，无法保证本次明确的尺寸要求，请更换配置或取消尺寸要求')
 const operation=mode==='generate'?(hasUpload?'reference':'generate'):target==='upload'?'reference':'fill'
 const route=negotiateGenerativeRoute(connection,{model,prompt:state.prompt,count:Number.parseInt(parameters.count,10),size:operation==='fill'?state.composerParameters.size:parameters.size,options,parameters:{...(overrides.strength!==undefined?{strength:overrides.strength}:{}),...(overrides.quality?{quality:overrides.quality}:{})},...(operation!=='generate'?{reference:'local-target'}:{}),...(operation==='fill'?{mask:'local-mask'}:{})},operation)
 for(const key of route.ignoredParameters)if(key in overrides)throw new Error(`图片模型不支持本次明确要求的参数：${key}，未发送请求`)
 return {sendSize:options.sendSize,sourceId,parameters,overrides,quality:overrides.quality,defaults:{...state.composerParameters}}
}
