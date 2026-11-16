/** A configured unit rate is an estimate, never a claim about provider billing. */
export type ImagePricing={unit:'image'|'request';amount:number;currency:string}
export type GenerationPlan={id:string;model:string;sourceName:string;imageCount:number;requestCount:number;concurrency:number;retryUnknown:boolean;upload:boolean;cost:{known:false}|{known:true;amount:number;currency:string;basis?:'server-quote'}}
export type GenerationAttempt={batchId:string;jobId:string;attemptId:string;signal:AbortSignal;isCurrent:()=>boolean}
export function validImagePricing(value:unknown):boolean{
 if(value===undefined)return true
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 return Object.values(value).every(v=>v&&typeof v==='object'&&['image','request'].includes(v.unit)&&Number.isFinite(v.amount)&&v.amount>=0&&typeof v.currency==='string'&&/^[A-Z]{3}$/.test(v.currency))
}
export function createGenerationPlan(input:{model:string;sourceName:string;count:number;strategy:'single'|'split';concurrency:number;pricing?:ImagePricing;retryUnknown?:boolean;upload?:boolean}):GenerationPlan{
 if(!Number.isInteger(input.count)||input.count<1||input.count>8)throw new Error('请求图片数量必须为1–8')
 const requestCount=input.strategy==='single'?1:input.count
 const pricing=input.pricing&&validImagePricing({model:input.pricing})?input.pricing:undefined
 return {id:crypto.randomUUID(),model:input.model,sourceName:input.sourceName,imageCount:input.count,requestCount,concurrency:Math.max(1,Math.min(4,input.concurrency,requestCount)),retryUnknown:!!input.retryUnknown,upload:!!input.upload,cost:pricing?{known:true,amount:pricing.amount*(pricing.unit==='image'?input.count:requestCount),currency:pricing.currency}:{known:false}}
}
export function generationConfirmation(plan:GenerationPlan){
 return [`${plan.retryUnknown?'重新请求未知结果':'确认图片生成请求'}`,`来源：${plan.sourceName}`,`目标模型：${plan.model}`,`${plan.imageCount} 张图片 · ${plan.requestCount} 次请求 · 并发上限 ${plan.concurrency}`,plan.cost.known?`预计费用：${Number(plan.cost.amount.toFixed(6))} ${plan.cost.currency}（${plan.cost.basis==='server-quote'?'服务端报价，以实际结算为准':'配置单价估算，以供应商账单为准'}）`:'费用未知；供应商可能按请求或图片计费，请检查其价格后继续。',...(plan.upload?['本次编辑会上传当前文档内容及蒙版。']:[]),...(plan.retryUnknown?['远端可能已受理之前的请求，重新生成可能重复计费。']:[]),'不会自动补发或自动付费重试。是否继续？'].join('\n')
}
export function confirmGenerationPlan(plan:GenerationPlan,confirm:(text:string)=>boolean=(text)=>window.confirm(text)){return confirm(generationConfirmation(plan))===true}
