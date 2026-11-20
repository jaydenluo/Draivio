import type { GenerationAttempt, GenerationPlan } from '../execution/generationJobs'
import type { ServiceConnection } from '../../creation/serviceConnections'
import { imageCapabilitiesFor, imageSupports, maskedEditCapability, normalizeImageSize, type ImageModelCapabilities } from '../../creation/imageEditCapabilities'
import type { ImageInput } from '../../creation/openaiImages'
import { ImageBatch } from '../../creation/imageBatch'
export type GenerativeOperation='generate'|'reference'|'fill'|'remove'|'outpaint'
export type GenerativeRoute={operation:GenerativeOperation;path:'images/generations'|'images/edits';encoding:'multipart'|'base64-json';capabilities:ImageModelCapabilities;size?:string;ignoredParameters:string[]}
export function negotiateGenerativeRoute(connection:ServiceConnection,input:ImageInput,operation:GenerativeOperation):GenerativeRoute{
 if(!['openai_compatible','volcengine'].includes(connection.protocol))throw new Error('该协议只有配置预设，尚未接入真实图片适配器')
 const capabilities=input.capabilities??imageCapabilitiesFor(connection,input.model),editing=operation!=='generate'
 if(!imageSupports(capabilities,editing?'edit':'generate'))throw new Error(editing?'该模型未声明参考图编辑能力；不会退回整图生成':'该模型不支持生成')
 if(editing&&!input.reference)throw new Error('编辑请求缺少参考图')
 if(operation==='fill'||operation==='remove'||operation==='outpaint'){
  if(!input.mask)throw new Error('局部填充、移除和扩图必须提交蒙版')
  if(!maskedEditCapability(connection,input.model))throw new Error('该模型没有已验证的蒙版编辑能力；不会退回整图生成')
 }
 if(!editing&&(input.reference||input.mask))throw new Error('文生图请求包含参考图或蒙版，请显式选择编辑操作，未降级处理')
 if(operation==='reference'&&input.mask)throw new Error('参考图操作包含蒙版，请显式选择填充、移除或扩图')
 if(!Number.isInteger(input.count)||input.count<1||input.count>8)throw new Error('图片数量必须为 1–8 的整数；更多图片请按批次请求')
 const size=input.options.sendSize?normalizeImageSize(input.size):undefined
 if(size&&!/^(auto|[1-9]\d*x[1-9]\d*)$/.test(size))throw new Error('输出尺寸格式无效')
 if(size&&capabilities.sizes&&!capabilities.sizes.map(normalizeImageSize).includes(size))throw new Error(`模型不支持输出尺寸 ${size}；可用：${capabilities.sizes.join('、')}，未改用其他尺寸`)
 const quality=input.parameters?.quality??(input.options.quality==='omit'?undefined:input.options.quality)
 if(quality&&capabilities.quality&&!capabilities.quality.includes(quality as 'auto'))throw new Error(`模型不支持输出质量 ${quality}，请重新选择`)
 const ignoredParameters=['steps','guidance','strength'].filter(key=>input.parameters?.[key as 'steps']!==undefined&&!capabilities[`supports${key[0].toUpperCase()+key.slice(1)}` as 'supportsSteps'])
 if(quality&&!capabilities.quality)ignoredParameters.push('quality')
 return {operation,path:editing?'images/edits':'images/generations',encoding:editing?capabilities.encoding:'base64-json',capabilities,...(size?{size}:{}),ignoredParameters}
}
/** Reuses count/concurrency/shortfall semantics; explicit retry fills only missing slots. */
export function createGenerativeBatch(count:number,strategy:'single'|'split',concurrency:number,request:(count:number,attempt:GenerationAttempt)=>Promise<(string|null)[]>,receive:(image:string,index:number,attempt:GenerationAttempt)=>unknown|Promise<unknown>,plan?:GenerationPlan){return new ImageBatch(count,strategy,concurrency,request,receive,plan)}

export type GenerativeRequest={expectedCloudSession?:number;signal?:AbortSignal;additionalReference?:string;model:string;prompt:string;count:number;size:string;options:ImageInput['options'];parameters?:ImageInput['parameters']} & (
 {operation:'generate';reference?:never;mask?:never}|
 {operation:'reference';reference:string;mask?:never}|
 {operation:'fill'|'remove'|'outpaint';reference:string;mask:{source:string;semantics:'transparent-edit'|'white-edit'}})
export async function executeGenerativeOperation(connection:ServiceConnection,request:GenerativeRequest){
 const input:ImageInput={...request,intent:request.operation==='generate'?'generate':request.operation==='reference'?'reference':'edit',mask:request.mask?.source}
 if(request.mask&&maskedEditCapability(connection,request.model)?.semantics!==request.mask.semantics)throw new Error('蒙版方向与端点声明不一致，未提交编辑请求')
 const {generateOpenAIImages}=await import('../../creation/openaiImages')
 return generateOpenAIImages(connection,input)
}
