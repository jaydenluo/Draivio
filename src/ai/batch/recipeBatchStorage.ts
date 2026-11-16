import {restoreRecipeBatch,type RecipeBatchRecord} from './recipeBatch'
const DB='draivio-recipe-batch-v1'
function open(){return new Promise<IDBDatabase>((resolve,reject)=>{if(typeof indexedDB==='undefined'){reject(new Error('当前环境无法保存批处理恢复记录'));return}const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{r.result.createObjectStore('records',{keyPath:'id'});r.result.createObjectStore('results')};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('无法打开批处理记录存储'))})}
async function operation<T>(store:string,mode:IDBTransactionMode,run:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{const db=await open();try{return await new Promise<T>((resolve,reject)=>{const tx=db.transaction(store,mode),request=run(tx.objectStore(store));let value:T;request.onsuccess=()=>{value=request.result};request.onerror=()=>reject(request.error);tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(tx.error??new Error('批处理存储失败（可能空间不足）'));tx.onerror=()=>reject(tx.error)})}finally{db.close()}}
export const recipeBatchStorage={
 save:async(record:RecipeBatchRecord)=>{await operation('records','readwrite',s=>s.put(structuredClone(record)))},
 putResult:async(id:string,blob:Blob)=>{await operation('results','readwrite',s=>s.put(blob,id))},
 getResult:async(id:string)=>operation<Blob|undefined>('results','readonly',s=>s.get(id)),
 list:async()=>{const values=await operation<RecipeBatchRecord[]>('records','readonly',s=>s.getAll());return values.map(restoreRecipeBatch).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,20)},
 remove:async(record:RecipeBatchRecord)=>{for(const item of record.items)if(item.resultId)await operation('results','readwrite',s=>s.delete(item.resultId!));await operation('records','readwrite',s=>s.delete(record.id))}
}
