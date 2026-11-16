import {cloudAccount,type CloudModel} from './cloudAccount'
import type {ServiceConnection} from '../creation/serviceConnections'
import type {ImageModelCapabilities} from '../creation/imageEditCapabilities'
export const OFFICIAL_CLOUD_ID='draivio-cloud'
export function officialModel(code:string,kind:'image'|'text'):CloudModel|undefined{
 const state=cloudAccount.getSnapshot()
 return state.authenticated?state.models.find(model=>(model.code===code||model.id===code)&&model.availability?.available===true&&model.modality===kind&&(kind==='image'?model.capabilities.includes('image'):model.capabilities.some(cap=>cap==='text'||cap==='chat'))):undefined
}
export function officialImageCapabilities(model:CloudModel):ImageModelCapabilities{
 // No catalog contract specifies mask semantics and input encoding. Do not infer edits from model names.
 return {generate:!!officialModel(model.code,'image'),edit:false,reference:false,encoding:'base64-json',...(Array.isArray(model.constraints.sizes)&&model.constraints.sizes.every(s=>typeof s==='string')?{sizes:model.constraints.sizes as string[]}:{}),...(Array.isArray(model.constraints.quality)&&model.constraints.quality.every(q=>['auto','low','medium','high'].includes(String(q)))?{quality:model.constraints.quality as ('auto'|'low'|'medium'|'high')[]}: {})}
}
/** Ephemeral routing metadata; never persist this connection and never expose session credentials. */
export function getOfficialCloudConnection():ServiceConnection|undefined{
 const state=cloudAccount.getSnapshot();if(!state.authenticated)return undefined
 const models=state.models.filter(model=>officialModel(model.code,'image')||officialModel(model.code,'text'))
 return {id:OFFICIAL_CLOUD_ID,provider:'Draivio 云端',name:'官方账户积分',baseUrl:'official-cloud-session',apiKey:'',protocol:'openai_compatible',enabled:true,models:models.map(m=>m.code),modelCapabilities:Object.fromEntries(models.map(m=>[m.code,{image:!!officialModel(m.code,'image'),text:!!officialModel(m.code,'text'),vision:m.constraints.supportsImageInput===true}])),imageCapabilities:Object.fromEntries(models.filter(m=>m.modality==='image').map(m=>[m.code,officialImageCapabilities(m)])),generation:{multiImage:'split',concurrency:1,sendSize:true,quality:'omit'}}
}
