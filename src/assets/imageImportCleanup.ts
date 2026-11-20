import type {ImageAssetClient} from './imageAssetClient'
import type {ImageAsset,ImageResourceRoot} from './imageAssetTypes'
import {imageResourceOwnership} from './imageAssetStore'
type Ownership={replace(owner:ImageResourceRoot,references:[]):Promise<void>}
type Cleanup={client:ImageAssetClient;asset:ImageAsset;ownership:Ownership;disposed:boolean;running?:Promise<void>}
// Retain uncertain cleanup beyond component unmount. The next native selection retries it.
const pending=new Map<ImageAsset,Cleanup>()
const completed=new WeakSet<ImageAsset>()
export function releaseImportAsset(client:ImageAssetClient,asset:ImageAsset,ownership:Ownership=imageResourceOwnership):Promise<void>{
 if(completed.has(asset))return Promise.resolve()
 let entry=pending.get(asset)
 if(!entry){entry={client,asset,ownership,disposed:false};pending.set(asset,entry)}
 if(entry.running)return entry.running
 const cleanup=entry
 cleanup.running=(async()=>{
  let error:unknown
  for(let attempt=0;attempt<3;attempt++){
   try{
    if(!cleanup.disposed){await cleanup.client.dispose(asset);cleanup.disposed=true}
    await cleanup.ownership.replace({kind:'transaction',id:`import:${asset.rasterRef?.assetId??asset.assetId}`},[])
    pending.delete(asset);completed.add(asset);return
   }catch(cause){error=cause}
  }
  throw error
 })().finally(()=>{cleanup.running=undefined})
 return cleanup.running
}
export async function retryImportCleanup():Promise<void>{
 await Promise.all([...pending.values()].map(entry=>releaseImportAsset(entry.client,entry.asset,entry.ownership)))
}
