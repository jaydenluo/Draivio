import { ImageRequestError, type ImageResults } from './openaiImages'
import type { GenerationAttempt, GenerationPlan } from '../ai/execution/generationJobs'
export type BatchStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'unknown' | 'missing' | 'cancelled'
export type BatchItem = { id:string; status: BatchStatus; attemptId?:string; message?: string }
export type BatchSnapshot = { id:string; items: BatchItem[]; running: boolean; plan?:GenerationPlan }

/** Epochs isolate late promises; credentials stay only in the request closure. */
export class ImageBatch {
  private snapshot: BatchSnapshot
  private listeners = new Set<() => void>()
  private limit:number
  private cooldown=0
  private epoch=0
  private controllers=new Set<AbortController>()
  private finishRun?:()=>void
  private timer?:ReturnType<typeof setTimeout>
  constructor(count:number,private strategy:'single'|'split',concurrency:number,
    private request:(count:number,attempt:GenerationAttempt)=>Promise<ImageResults>,private onImage:(image:string,index:number,attempt:GenerationAttempt)=>unknown|Promise<unknown>,plan?:GenerationPlan){
    const id=plan?.id??crypto.randomUUID()
    this.snapshot={id,items:Array.from({length:Math.max(1,Math.min(8,count))},(_,i)=>({id:`${id}:${i}`,status:'queued'})),running:false,plan}
    this.limit=Math.max(1,Math.min(4,concurrency))
  }
  getSnapshot=()=>this.snapshot
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}}
  private publish(){this.snapshot={...this.snapshot,items:this.snapshot.items.map(item=>({...item}))};this.listeners.forEach(listener=>listener())}
  setPlan(plan:GenerationPlan){this.snapshot={...this.snapshot,plan};this.publish()}
  cancel(){
    if(!this.snapshot.running)return
    this.epoch++
    for(const item of this.snapshot.items){
      if(item.status==='running'){item.status='unknown';item.message='已取消接收；远端可能已受理或计费，迟到结果不会写入。请先检查供应商记录。'}
      else if(item.status==='queued'){item.status='cancelled';item.message='取消前未提交，可手动补齐。'}
    }
    for(const controller of this.controllers)controller.abort()
    this.controllers.clear();if(this.timer)clearTimeout(this.timer)
    this.finishRun?.();this.finishRun=undefined;this.snapshot.running=false;this.publish()
  }
  retryIndices(includeUnknown=false){return this.snapshot.items.flatMap((item,index)=>['failed','missing',...(includeUnknown?['unknown']:[])].includes(item.status)?[index]:[])}
  retry(includeUnknown=false){return this.runIndices(this.retryIndices(includeUnknown))}
  run(indices=this.snapshot.items.flatMap((item,index)=>item.status==='queued'?[index]:[])){return this.runIndices([...new Set(indices)].filter(i=>this.snapshot.items[i]?.status==='queued'))}
  private async runIndices(indices:number[]):Promise<void>{
    if(this.snapshot.running||!indices.length)return
    const epoch=++this.epoch
    indices.forEach(i=>{this.snapshot.items[i]={id:this.snapshot.items[i].id,status:'queued'}})
    this.snapshot.running=true;this.publish()
    const jobs=this.strategy==='single'?[indices]:indices.map(i=>[i]);let active=0,sequence=0
    await new Promise<void>(resolve=>{
      this.finishRun=resolve
      const current=()=>epoch===this.epoch
      const fail=(index:number,reason:unknown)=>{
        if(!current()||this.snapshot.items[index].status==='succeeded')return
        const error=reason instanceof ImageRequestError?reason:new ImageRequestError('请求结果未知，请检查供应商记录',true)
        this.snapshot.items[index]={...this.snapshot.items[index],status:error.uncertain?'unknown':'failed',message:error.message}
        if(error.status===429){this.limit=1;this.cooldown=Date.now()+Math.min(60000,Math.max(1000,error.retryAfter))}
      }
      const pump=()=>{
        if(!current())return
        if(this.timer){clearTimeout(this.timer);this.timer=undefined}
        if(!jobs.length&&!active){resolve();return}
        if(jobs.length&&Date.now()<this.cooldown){this.timer=setTimeout(pump,this.cooldown-Date.now());return}
        while(current()&&jobs.length&&active<this.limit){
          const slots=jobs.shift()!,controller=new AbortController(),attemptId=`${this.snapshot.id}:${epoch}:${sequence++}`
          this.controllers.add(controller);active++
          slots.forEach(i=>{this.snapshot.items[i]={...this.snapshot.items[i],status:'running',attemptId}});this.publish()
          const attempt:GenerationAttempt={batchId:this.snapshot.id,jobId:this.snapshot.items[slots[0]].id,attemptId,signal:controller.signal,isCurrent:()=>current()&&!controller.signal.aborted}
          const execute=async()=>attempt.isCurrent()?this.request(slots.length,attempt):[]
          void execute().then(async images=>{
            if(!attempt.isCurrent())return
            for(let offset=0;offset<slots.length&&attempt.isCurrent();offset++){
              const index=slots[offset],item=this.snapshot.items[index]
              if(item.status!=='running'||item.attemptId!==attemptId)continue
              const image=images[offset]
              if(image){try{await this.onImage(image,index,{...attempt,jobId:item.id});if(attempt.isCurrent())this.snapshot.items[index]={...item,status:'succeeded'}}catch(error){fail(index,error instanceof ImageRequestError?error:new ImageRequestError(`图片已返回，但本地处理失败：${error instanceof Error?error.message:'无法接收图片'}；重新请求可能另行计费`,false))}}
              else this.snapshot.items[index]={...item,status:image===null?'unknown':'missing',message:image===null?'返回图片格式无效，结果未知，请先检查供应商记录':'接口未返回此图片，未自动补发'}
            }
          }).catch(error=>{slots.forEach(i=>fail(i,error))}).finally(()=>{this.controllers.delete(controller);if(!current())return;active--;this.publish();pump()})
        }
      }
      pump()
    })
    if(epoch!==this.epoch)return
    this.finishRun=undefined;this.snapshot.running=false;this.publish()
  }
}
