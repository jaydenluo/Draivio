import { requestJson } from '../../lib/request'
export type TargetCandidate={id:string;label:string;confidence:number;alpha:Uint8Array}
export type Segmentation={width:number;height:number;candidates:TargetCandidate[]}
export function parseSegmentation(value:unknown):Segmentation {
 const v=value as {width:number;height:number;candidates:unknown[]}
 if(!v||![v.width,v.height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=4096)||v.width*v.height>4_194_304||!Array.isArray(v.candidates)||!v.candidates.length||v.candidates.length>32)throw new Error('分割未返回有效对象蒙版')
 const ids=new Set<string>();const candidates=v.candidates.map(item=>{
  const c=item as {id:string;label:string;confidence:number;alpha:number[]}
  if(!c||typeof c.id!=='string'||!c.id.trim()||c.id.length>128||ids.has(c.id)||typeof c.label!=='string'||!c.label.trim()||c.label.length>256||!Number.isFinite(c.confidence)||c.confidence<0||c.confidence>1||!Array.isArray(c.alpha)||c.alpha.length!==v.width*v.height||c.alpha.some(a=>!Number.isInteger(a)||a<0||a>255)||!c.alpha.some(a=>a>0))throw new Error('分割对象或像素蒙版无效，不生成替代蒙版')
  ids.add(c.id);return {id:c.id,label:c.label,confidence:c.confidence,alpha:new Uint8Array(c.alpha)}
 });return {width:v.width,height:v.height,candidates}
}
export function resolveTarget(result:Segmentation,selectedId?:string):{kind:'resolved';candidate:TargetCandidate}|{kind:'choose';candidates:TargetCandidate[];reason:string}{
 if(selectedId){const candidate=result.candidates.find(c=>c.id===selectedId);if(!candidate)throw new Error('目标候选已失效');return {kind:'resolved',candidate}}
 if(result.candidates.length!==1||result.candidates[0].confidence<.8)return {kind:'choose',candidates:result.candidates,reason:result.candidates.length>1?'检测到多个对象，请明确点选':'置信度较低，请检查并明确点选'}
 return {kind:'resolved',candidate:result.candidates[0]}
}
/** Explicit configured inference service. No local background heuristic or empty-mask fallback. */
export async function requestSegmentation(options:{endpoint:string;image:string;target:'subject'|'background'|'object';query?:string;signal?:AbortSignal}):Promise<Segmentation>{
 if(!options.endpoint.trim())throw new Error('未配置语义分割服务；当前没有可用的本地语义推理引擎')
 let url:URL;try{url=new URL(options.endpoint)}catch{throw new Error('分割服务地址无效')}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash)throw new Error('分割服务地址必须为 HTTP(S)，且不含凭据或片段')
 if(options.target==='object'&&!options.query?.trim())throw new Error('请描述需要定位的物体')
 if(!options.image.startsWith('data:image/'))throw new Error('分割输入必须为当前图层图像')
 const result=await requestJson(url.href,{method:'POST',body:{image:options.image,target:options.target==='background'?'subject':options.target,query:options.query?.trim()||undefined,output:'alpha-candidates-v1'},signal:options.signal,timeoutMs:120000,maxResponseBytes:32*1024*1024})
 if(result.status<200||result.status>=300)throw new Error(`语义分割服务失败（${result.status}），未生成蒙版`)
 if(options.signal?.aborted)throw new DOMException('已取消分割','AbortError')
 return parseSegmentation(result.body)
}
