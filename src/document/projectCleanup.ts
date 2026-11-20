type Cleanup={dispose:()=>Promise<void>;releaseRoots:()=>Promise<void>}
type Pending=Cleanup&{disposed:boolean;running?:Promise<void>}
/** Module-owned retry state outlives React mounts. Durable roots are retained
 * until every runtime capability has confirmed disposal. */
export class ProjectCleanupQueue {
 private readonly pending=new Map<string,Pending>()
 get size(){return this.pending.size}
 release(id:string,cleanup:Cleanup):Promise<void>{
  let entry=this.pending.get(id)
  if(!entry){entry={...cleanup,disposed:false};this.pending.set(id,entry)}
  if(entry.running)return entry.running
  const state=entry
  state.running=(async()=>{
   let failure:unknown
   for(let attempt=0;attempt<3;attempt++){
    try{
     if(!state.disposed){await state.dispose();state.disposed=true}
     await state.releaseRoots();this.pending.delete(id);return
    }catch(error){failure=error}
   }
   throw failure
  })().finally(()=>{state.running=undefined})
  return state.running
 }
 async retry():Promise<void>{await Promise.all([...this.pending].map(([id,entry])=>this.release(id,entry)))}
}
export const projectCleanup=new ProjectCleanupQueue()
