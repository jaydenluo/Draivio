import {copyGenerationMetadata} from './generationMetadata'
import {isTauri} from '@tauri-apps/api/core'
import {invokeCommand} from '../lib/native'
import type {AIResult} from '../state/editor'
import {resultImageData,resultSizeLabel} from './resultImage'

export type ArchivedResult=Omit<AIResult,'request'|'source'> & {documentId:string}
const DB='draivio-result-library-v1'
function open(){return new Promise<IDBDatabase>((resolve,reject)=>{
 if(typeof indexedDB==='undefined'){reject(new Error('当前环境无法保存本地作品库'));return}
 const r=indexedDB.open(DB,1)
 r.onupgradeneeded=()=>{r.result.createObjectStore('records',{keyPath:'id'});r.result.createObjectStore('images')}
 r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('无法打开本地作品库'))
})}
async function transact<T>(stores:string[],mode:IDBTransactionMode,run:(tx:IDBTransaction)=>IDBRequest<T>):Promise<T>{
 const db=await open()
 try{return await new Promise<T>((resolve,reject)=>{
  const tx=db.transaction(stores,mode),r=run(tx);let value:T
  r.onsuccess=()=>{value=r.result};r.onerror=()=>reject(new Error('本地作品库读写失败'))
  tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(new Error('本地保存失败，请检查剩余空间'));tx.onabort=()=>reject(new Error('本地保存已中止'))
 })}finally{db.close()}
}
function metadata(result:AIResult,documentId:string):ArchivedResult{
 return {...(result.error?{error:result.error}:{}),...(result.generationMetadata?{generationMetadata:copyGenerationMetadata(result.generationMetadata)}:{}),id:result.id,documentId,prompt:result.prompt,model:result.model,provider:result.provider,size:result.source?resultSizeLabel(result.source,result.size):result.size,createdAt:result.createdAt,status:result.status,favorite:result.favorite,adopted:result.adopted,...(result.thumbnail&&result.thumbnail.length<256*1024?{thumbnail:result.thumbnail}:{})}
}
async function thumbnail(result:AIResult):Promise<string|undefined>{
 const existing=result.thumbnail&&result.thumbnail.length<256*1024?result.thumbnail:undefined
 if(existing)return existing
 if(typeof createImageBitmap==='undefined')return result.source&&result.source.length<256*1024?result.source:undefined
 let image:ImageBitmap|undefined
 try{
  const data=resultImageData(result.source!);image=await createImageBitmap(new Blob([data.bytes],{type:data.mime}))
  const ratio=Math.min(1,256/Math.max(image.width,image.height)),canvas=document.createElement('canvas')
  canvas.width=Math.max(1,Math.round(image.width*ratio));canvas.height=Math.max(1,Math.round(image.height*ratio))
  const context=canvas.getContext('2d');if(!context)return undefined
  context.drawImage(image,0,0,canvas.width,canvas.height)
  const preview=canvas.toDataURL('image/webp',.8)
  if(preview.length<256*1024)return preview
  const smaller=canvas.toDataURL('image/jpeg',.8)
  return smaller.length<256*1024?smaller:undefined
 }catch{return undefined}finally{image?.close()}
}
export const resultArchive={
 async save(result:AIResult,documentId:string,favoriteOverride?:boolean){
  if(result.status!=='success'||!result.source)throw new Error('图片尚不可保存')
  resultImageData(result.source)
  const record=metadata(result,documentId)
  record.thumbnail=await thumbnail(result)
  if(isTauri()){await invokeCommand('result_library_save',{record,source:result.source,favoriteOverride});return}
  await transact(['records','images'],'readwrite',tx=>{
   const records=tx.objectStore('records'),images=tx.objectStore('images'),read=records.get(result.id)
   read.addEventListener('success',()=>{
    const existing=read.result as ArchivedResult|undefined
    const merged=existing?{...existing,adopted:existing.adopted||record.adopted,favorite:favoriteOverride??existing.favorite,thumbnail:existing.thumbnail??record.thumbnail}:record
    if(existing){const original=images.get(result.id);original.addEventListener('success',()=>{if(original.result&&original.result!==result.source){tx.abort();return}images.put(result.source!,result.id);records.put(merged)})}
    else{images.put(result.source!,result.id);records.put(merged)}
   })
   return read
  })
 },
 async list():Promise<ArchivedResult[]>{
  const records=isTauri()?await invokeCommand<ArchivedResult[]>('result_library_list'):await transact<ArchivedResult[]>(['records'],'readonly',tx=>tx.objectStore('records').getAll())
  return records.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))
 },
 async load(id:string):Promise<string>{
  const source=isTauri()?await invokeCommand<string>('result_library_load',{id}):await transact<string|undefined>(['images'],'readonly',tx=>tx.objectStore('images').get(id))
  if(!source)throw new Error('本地图片不存在，请从原项目恢复')
  return source
 },
 async remove(id:string){
  if(isTauri()){await invokeCommand('result_library_remove',{id});return}
  await transact(['records','images'],'readwrite',tx=>{tx.objectStore('images').delete(id);return tx.objectStore('records').delete(id)})
 },
 async reveal(id:string){if(!isTauri())throw new Error('浏览器作品库保存在本机浏览器存储，可通过保存图片导出');await invokeCommand('result_library_reveal',{id})},
 async export(result:AIResult):Promise<boolean>{
  if(!result.source)throw new Error('图片尚不可保存')
  const data=resultImageData(result.source),name=`Draivio-${result.id}.${data.extension}`
  if(isTauri())return invokeCommand<boolean>('result_library_export',{source:result.source,suggestedName:name})
  const url=URL.createObjectURL(new Blob([data.bytes],{type:data.mime})),link=document.createElement('a')
  link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)
  return true
 }
}
