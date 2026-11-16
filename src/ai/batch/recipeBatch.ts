import type {BatchInput} from '../../batch/batchProcessor'
import {outputName,MAX_BATCH_FILES} from '../../batch/batchProcessor'
import {parseRecipe,assertRecipeJson,type Recipe,type RecipeValue} from '../recipes/schema'
export type RecipeBatchConfig={recipe:Recipe;parameters:Record<string,RecipeValue>;inputSlot:string;concurrency:number;prefix:string;maxRequests:number;budgetMicros:number}
export type BatchQuote={requests:number;costMicros:number}
export type RecipeBatchItem={id:string;name:string;index:number;status:'pending'|'running'|'writing'|'success'|'failed'|'cancelled'|'budget-stopped'|'output-uncertain'|'interrupted';attempts:number;output?:string;error?:string;resultId?:string;reservedRequests:number;reservedMicros:number}
export type RecipeBatchRecord={version:1;id:string;config:RecipeBatchConfig;createdAt:string;items:RecipeBatchItem[];trialSucceeded:boolean;reservedRequests:number;reservedMicros:number;stopReason?:string}
const integer=(v:number)=>Number.isSafeInteger(v)&&v>=0
export class BatchBudget{
 readonly reservations=new Set<string>();requests:number;costMicros:number
 constructor(readonly maxRequests:number,readonly maxMicros:number,used:BatchQuote={requests:0,costMicros:0}){if(![maxRequests,maxMicros,used.requests,used.costMicros].every(integer)||used.requests>maxRequests||used.costMicros>maxMicros)throw new Error('预算或请求上限无效');this.requests=used.requests;this.costMicros=used.costMicros}
 reserve(key:string,quote:BatchQuote){if(this.reservations.has(key))throw new Error('重复预算预留');if(![quote.requests,quote.costMicros].every(integer))throw new Error('预算预留无效');if(quote.requests>this.maxRequests-this.requests)throw new Error('请求次数上限，已停止排队');if(quote.costMicros>this.maxMicros-this.costMicros)throw new Error('预算上限，已停止排队');this.requests+=quote.requests;this.costMicros+=quote.costMicros;this.reservations.add(key)}
}
export function validateBatchConfig(value:RecipeBatchConfig):RecipeBatchConfig{
 const config=structuredClone(value);config.recipe=parseRecipe(config.recipe);assertRecipeJson(config.parameters)
 if(!config.parameters||typeof config.parameters!=='object'||Array.isArray(config.parameters)||!config.recipe.inputs.some(i=>i.id===config.inputSlot)||config.recipe.inputs.filter(i=>i.required&&i.id!==config.inputSlot).length)throw new Error('批处理需明确绑定一个输入图层；多输入配方请改为单输入')
 if(![1,2].includes(config.concurrency)||typeof config.prefix!=='string'||!config.prefix.trim()||config.prefix.length>80||/[\\/\x00-\x1f]/.test(config.prefix))throw new Error('并发或输出前缀无效')
 new BatchBudget(config.maxRequests,config.budgetMicros);return config
}
export function restoreRecipeBatch(value:unknown):RecipeBatchRecord{
 const r=structuredClone(value) as RecipeBatchRecord
 if(!r||r.version!==1||typeof r.id!=='string'||r.id.length>160||!Array.isArray(r.items)||r.items.length>MAX_BATCH_FILES)throw new Error('批处理恢复记录无效')
 r.config=validateBatchConfig(r.config);new BatchBudget(r.config.maxRequests,r.config.budgetMicros,{requests:r.reservedRequests,costMicros:r.reservedMicros})
 const statuses=['pending','running','writing','success','failed','cancelled','budget-stopped','output-uncertain','interrupted'],ids=new Set<string>()
 for(const item of r.items){if(!item||typeof item.id!=='string'||ids.has(item.id)||typeof item.name!=='string'||!statuses.includes(item.status)||![item.index,item.attempts,item.reservedRequests,item.reservedMicros].every(integer)||item.output!==undefined&&typeof item.output!=='string'||item.resultId!==undefined&&typeof item.resultId!=='string')throw new Error('批处理恢复条目无效');ids.add(item.id);if(item.status==='running'||item.status==='writing'){item.status='interrupted';item.error='上次执行中断；不自动重发或重复写出，请检查输出文件'} }
 r.trialSucceeded=false;return r
}
export type RecipeBatchDependencies={process:(input:BatchInput,config:RecipeBatchConfig,signal:AbortSignal)=>Promise<Blob>;write:(name:string,blob:Blob)=>Promise<string>;save:(record:RecipeBatchRecord)=>Promise<void>;putResult:(id:string,blob:Blob)=>Promise<void>;quote?:BatchQuote;update?:(record:RecipeBatchRecord)=>void}
/** Isolated queue: never reads or dispatches an active editor document. */
export class RecipeBatch{
 readonly record:RecipeBatchRecord;readonly results=new Map<string,Blob>();private readonly sources:Map<string,BatchInput>;private readonly budget:BatchBudget;private running=false;private cancelled=false;private controller:AbortController|null=null;private journal:Promise<void>=Promise.resolve();private writes:Promise<unknown>=Promise.resolve()
 constructor(inputs:BatchInput[],config:RecipeBatchConfig,private readonly deps:RecipeBatchDependencies){
  if(!inputs.length||inputs.length>MAX_BATCH_FILES||new Set(inputs.map(i=>i.id)).size!==inputs.length||inputs.some(i=>!i.id||!i.name))throw new Error('批处理文件为空、重复或超过1000项')
  const frozen=validateBatchConfig(config);this.sources=new Map(inputs.map(i=>[i.id,i]));this.budget=new BatchBudget(frozen.maxRequests,frozen.budgetMicros)
  this.record={version:1,id:crypto.randomUUID(),createdAt:new Date().toISOString(),config:frozen,items:inputs.map((i,index)=>({id:i.id,name:i.name,index,status:'pending',attempts:0,reservedRequests:0,reservedMicros:0})),trialSucceeded:false,reservedRequests:0,reservedMicros:0}
 }
 private async persist(){const value=structuredClone(this.record);this.deps.update?.(value);this.journal=this.journal.then(()=>this.deps.save(value));try{await this.journal}catch(e){this.cancelled=true;this.controller?.abort();this.record.stopReason='记录存储失败，停止排队；检查已写出的文件再继续';this.deps.update?.(structuredClone(this.record));throw e}}
 cancel(){this.cancelled=true;this.controller?.abort();this.record.stopReason='已取消；已完成结果保留'}
 async trial(){if(this.record.trialSucceeded)throw new Error('试跑已成功，请检查结果后开始批量');const first=this.record.items.find(i=>i.status==='pending'||i.status==='failed');if(!first)throw new Error('没有可试跑条目');await this.execute([first],1,true)}
 async run(){if(!this.record.trialSucceeded)throw new Error('请先成功试跑一张');await this.execute(this.record.items.filter(i=>i.status==='pending'),this.record.config.concurrency,false)}
 async retryFailed(){await this.execute(this.record.items.filter(i=>i.status==='failed'),this.record.config.concurrency,!this.record.trialSucceeded)}
 private async execute(items:RecipeBatchItem[],concurrency:number,trial:boolean){
  if(this.running)throw new Error('批处理正在运行');this.running=true;this.cancelled=false;this.controller=new AbortController();delete this.record.stopReason
  let cursor=0,stopped=false;const signal=this.controller.signal
  try{await this.persist();await Promise.all(Array.from({length:concurrency},async()=>{while(!this.cancelled&&!stopped&&cursor<items.length){const item=items[cursor++],quote=this.deps.quote??{requests:0,costMicros:0}
   try{this.budget.reserve(`${item.id}:${item.attempts+1}`,quote)}catch(e){item.status='budget-stopped';item.error=e instanceof Error?e.message:'预算不足';this.record.stopReason=item.error;stopped=true;await this.persist();break}
   item.attempts++;item.reservedRequests+=quote.requests;item.reservedMicros+=quote.costMicros;this.record.reservedRequests=this.budget.requests;this.record.reservedMicros=this.budget.costMicros;item.status='running';delete item.error;await this.persist()
   try{
    const blob=await this.deps.process(this.sources.get(item.id)!,structuredClone(this.record.config),signal);if(signal.aborted)throw new DOMException('批处理已取消','AbortError');if(!blob.size)throw new Error('配方没有生成输出')
    const resultId=`${this.record.id}:${item.id}`;this.results.set(item.id,blob);await this.deps.putResult(resultId,blob);item.resultId=resultId;if(signal.aborted)throw new DOMException('批处理已取消','AbortError');item.status='writing';await this.persist()
    // serialize existing browser directory writes so existence checks cannot race.
    const write=this.writes.catch(()=>{}).then(()=>this.deps.write(outputName(`${this.record.config.prefix}-${item.name.split(/[\\/]/).pop()}`,'png',item.index),blob));this.writes=write
    item.output=await write;item.status='success';if(trial)this.record.trialSucceeded=true
   }catch(e){item.status=item.status==='writing'?'output-uncertain':signal.aborted?'cancelled':'failed';item.error=e instanceof Error?e.message:'配方处理失败';if(item.status==='output-uncertain')item.error+='；写出结果不确定，不自动重试，请核对文件或下载已生成结果'}
   await this.persist()
  }}));if(this.cancelled){for(const item of items.slice(cursor))if(item.status==='pending')item.status='cancelled';await this.persist()}}
  finally{this.running=false;this.controller=null}
 }
}
