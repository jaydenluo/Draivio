import {isTauri} from '@tauri-apps/api/core'
import {invokeCommand} from '../lib/native'
import {requestJson, type JsonOptions, type JsonResponse} from '../lib/http'

export type CloudModel = {
  id:string; code:string; displayName:string; modality:string; capabilities:string[]; constraints:Record<string,unknown>
  publisher?:string; isDefault?:boolean; availability?:{available:boolean; reason?:string}; estimatedCredits?:number; pricing?:Record<string,unknown>
}
export type CloudAccountSnapshot = {authenticated:boolean; user:{email:string}|null; balance:number|null; models:CloudModel[]}
export type AuthPurpose = 'login'|'register'|'password_reset'
export class CloudAccountError extends Error {
  constructor(public code:string, public status=0) {super(code);this.name='CloudAccountError'}
}
const publicPaths=new Set(['/api/auth/me','/api/account/overview','/api/account/payment-methods','/api/account/vouchers/redeem','/api/account/payment-orders','/api/model-gateway/v1/models','/api/model-gateway/v1/balance','/api/model-gateway/v1/quotes','/api/model-gateway/v1/images/generations','/api/model-gateway/v1/images/edits','/api/model-gateway/v1/chat/completions'])
const authPaths=new Set(['/api/auth/email-codes','/api/auth/email-codes/verify','/api/auth/password-login','/api/auth/register','/api/auth/password-reset','/api/auth/password-reset/codes','/api/auth/refresh','/api/auth/logout'])
function object(value:unknown):Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}}
function codeFor(body:unknown,status:number){const data=object(body);const code=data.code??object(data.error).code;return typeof code==='string'&&/^[a-zA-Z0-9_.-]{1,64}$/.test(code)?code:`HTTP_${status}`}
function checked(response:JsonResponse){if(response.status<200||response.status>=300)throw new CloudAccountError(codeFor(response.body,response.status),response.status);return object(response.body)}
function pathAllowed(path:string){return publicPaths.has(path)||/^\/api\/account\/payment-orders\/[a-zA-Z0-9_-]{1,100}$/.test(path)}
function originValue(value:string){
  let origin:URL;try{origin=new URL(value)}catch{throw new CloudAccountError('INVALID_CLOUD_ORIGIN')}
  if(origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/'||!(origin.protocol==='https:'||(origin.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(origin.hostname))))throw new CloudAccountError('INVALID_CLOUD_ORIGIN')
  return origin.origin
}
function installationId(){
  const key='draivio-cloud-device-id';let id:string|null=null
  try{id=localStorage.getItem(key)}catch{/* Storage may be unavailable. */}
  if(!id||!(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))){id=crypto.randomUUID();try{localStorage.setItem(key,id)}catch{/* This nonsecret identifier may remain session-only. */}}
  return id
}
function modelsFrom(body:Record<string,unknown>):CloudModel[]{
  const entries=Array.isArray(body.data)?body.data:body.items
  if(!Array.isArray(entries))throw new CloudAccountError('INVALID_MODEL_CATALOG')
  return entries.map((entry):CloudModel=>{
    const data={...object(entry)}
    if(typeof data.code!=='string'&&typeof data.id==='string')data.code=data.id
    if(typeof data.id!=='string'||typeof data.code!=='string'||typeof data.displayName!=='string'||typeof data.modality!=='string'||!Array.isArray(data.capabilities)||!data.capabilities.every(x=>typeof x==='string'))throw new CloudAccountError('INVALID_MODEL_CATALOG')
    const available=object(data.availability)
    const rawPublisher = object(data.modelDefinition).publisher
    const publisher = typeof rawPublisher === 'string' ? rawPublisher.trim() : ''
    return {id:data.id,code:data.code,displayName:data.displayName,modality:data.modality,capabilities:[...data.capabilities] as string[],constraints:object(data.constraints),...(publisher?{publisher}:{}),...(typeof data.isDefault==='boolean'?{isDefault:data.isDefault}:{}),...(typeof available.available==='boolean'?{availability:{available:available.available,...(typeof available.reason==='string'?{reason:available.reason}:{})}}:{}),...(typeof data.estimatedCredits==='number'&&Number.isFinite(data.estimatedCredits)?{estimatedCredits:data.estimatedCredits}:{}),...(data.pricing?{pricing:object(data.pricing)}:{})}
  })
}
const empty=():CloudAccountSnapshot=>({authenticated:false,user:null,balance:null,models:[]})
/** Credentials stay in this closure. Snapshot/persistence never contain tokens or password. */
export function createCloudAccount(config:{origin:string}){
  let origin=originValue(config.origin)
  let snapshot=empty(), accessToken='', refreshToken='', epoch=0, authEpoch=0
  let refreshFlight:Promise<void>|null=null
  let modelFlight: { session: number; promise: Promise<CloudModel[]> } | undefined
  let catalogRequest = 0
  let appliedCatalogRequest = 0
  const listeners=new Set<()=>void>()
  const publish=(next:CloudAccountSnapshot)=>{snapshot=next;for(const listener of listeners)listener()}
  const clear=()=>{accessToken='';refreshToken='';refreshFlight=null;publish(empty())}
  const assertCurrent=(session:number)=>{if(session!==epoch)throw new CloudAccountError('SESSION_CHANGED')}
  async function transport(path:string,options:JsonOptions={},token=''):Promise<JsonResponse>{
    if(!pathAllowed(path)&&!authPaths.has(path))throw new CloudAccountError('INVALID_CLOUD_PATH')
    if(options.signal?.aborted)throw new CloudAccountError('REQUEST_CANCELLED')
    const headers:Record<string,string>={}
    for(const [key,value] of Object.entries(options.headers??{}))if(!['authorization','cookie','x-moviviz-client'].includes(key.toLowerCase()))headers[key]=value
    headers['X-MOVIVIZ-Client']='desktop'
    if(token)headers.Authorization=`Bearer ${token}`
    const requestOptions:JsonOptions={...options,headers,...(path==='/api/model-gateway/v1/models'?{cache:'no-store' as const}:{})}
    const response=isTauri()?await invokeCommand<JsonResponse>('cloud_account_request',{origin,path,options:{method:options.method??'GET',headers,body:options.body??null,timeoutMs:options.timeoutMs??10000,maxResponseBytes:options.maxResponseBytes??64*1024*1024}}):await requestJson(`${origin}${path}`,requestOptions)
    if(options.signal?.aborted)throw new CloudAccountError('REQUEST_CANCELLED')
    return response.status>=200&&response.status<300?response:{...response,body:{code:codeFor(response.body,response.status)}}
  }
  async function refresh(session:number){
    assertCurrent(session)
    if(!refreshToken)throw new CloudAccountError('SESSION_REQUIRED',401)
    if(!refreshFlight){
      const currentRefresh=refreshToken
      const flight=(async()=>{
        try{
          const body=checked(await transport('/api/auth/refresh',{method:'POST',body:{refreshToken:currentRefresh}}))
          assertCurrent(session)
          if(typeof body.accessToken!=='string'||!body.accessToken||typeof body.refreshToken!=='string'||!body.refreshToken)throw new CloudAccountError('INVALID_SESSION_RESPONSE')
          accessToken=body.accessToken;refreshToken=body.refreshToken
        }catch(error){if(session===epoch){epoch++;authEpoch++;clear()}throw error}
      })()
      refreshFlight=flight
      void flight.finally(()=>{if(refreshFlight===flight)refreshFlight=null}).catch(()=>{})
    }
    return refreshFlight
  }
  async function request(path:string,options:JsonOptions={}):Promise<JsonResponse>{
    if(!pathAllowed(path))throw new CloudAccountError('INVALID_CLOUD_PATH')
    if(!accessToken)throw new CloudAccountError('SESSION_REQUIRED',401)
    const session=epoch, usedToken=accessToken
    let response=await transport(path,options,usedToken);assertCurrent(session)
    if(response.status===401){
      // A concurrent request may already have rotated the token.
      if(usedToken===accessToken)await refresh(session)
      assertCurrent(session)
      response=await transport(path,options,accessToken);assertCurrent(session)
      if(response.status===401){epoch++;authEpoch++;clear()}
    }
    return response
  }
  async function readAccount(send:(path:string)=>Promise<JsonResponse>):Promise<CloudAccountSnapshot>{
    const [me,overview,catalog]=await Promise.all(['/api/auth/me','/api/model-gateway/v1/balance','/api/model-gateway/v1/models'].map(async path=>checked(await send(path))))
    if(typeof me.email!=='string'||!me.email)throw new CloudAccountError('INVALID_ACCOUNT_RESPONSE')
    const raw=overview.balance, balance=typeof raw==='number'?raw:typeof raw==='string'&&raw.trim()?Number(raw):NaN
    if(!Number.isFinite(balance)||balance<0)throw new CloudAccountError('INVALID_ACCOUNT_RESPONSE')
    return {authenticated:true,user:{email:me.email},balance,models:modelsFrom(catalog)}
  }
  function refreshModels(): Promise<CloudModel[]> {
    const session = epoch
    if (modelFlight?.session === session) return modelFlight.promise

    const revision = ++catalogRequest
    const promise = request('/api/model-gateway/v1/models').then(response => {
      assertCurrent(session)
      const models = modelsFrom(checked(response))
      if (revision < appliedCatalogRequest) return snapshot.models
      appliedCatalogRequest = revision
      publish({ ...snapshot, models })
      return models
    }).finally(() => {
      if (modelFlight?.promise === promise) modelFlight = undefined
    })
    modelFlight = { session, promise }
    return promise
  }
  async function authenticate(path:string,body:Record<string,unknown>){
    const attempt=++authEpoch,session=epoch
    const current=()=>{assertCurrent(session);if(attempt!==authEpoch)throw new CloudAccountError('SESSION_CHANGED')}
    const tokens=checked(await transport(path,{method:'POST',body:{...body,...(typeof body.email==='string'?{email:body.email.trim().toLowerCase()}:{}),installationId:installationId(),deviceLabel:'Draivio'}}));current()
    if(typeof tokens.accessToken!=='string'||!tokens.accessToken||typeof tokens.refreshToken!=='string'||!tokens.refreshToken)throw new CloudAccountError('INVALID_SESSION_RESPONSE')
    const next=await readAccount(p=>transport(p,{},tokens.accessToken as string));current()
    epoch++;refreshFlight=null;accessToken=tokens.accessToken;refreshToken=tokens.refreshToken;publish(next)
    return snapshot
  }
  return {
    getSnapshot:()=>snapshot,
    getOrigin:()=>origin,
    getSessionVersion:()=>epoch,
    configureOrigin:(value:string)=>{const next=originValue(value.trim());if(next!==origin){epoch++;authEpoch++;origin=next;clear()}},
    subscribe:(listener:()=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener)}},
    cancelPendingAuthentication:()=>{authEpoch++},
    requestCode:async(email:string,purpose:AuthPurpose)=>{email=email.trim().toLowerCase();checked(await transport(purpose==='password_reset'?'/api/auth/password-reset/codes':'/api/auth/email-codes',{method:'POST',body:purpose==='password_reset'?{email}:{email,purpose}}))},
    codeLogin:(email:string,code:string)=>authenticate('/api/auth/email-codes/verify',{email,code,purpose:'login'}),
    passwordLogin:(email:string,password:string)=>authenticate('/api/auth/password-login',{email,password}),
    register:(email:string,code:string,password:string)=>authenticate('/api/auth/email-codes/verify',{email,code,password,purpose:'register'}),
    registerWithoutCode:(email:string,password:string)=>authenticate('/api/auth/register',{email,password}),
    resetPassword:async(email:string,code:string,password:string)=>{checked(await transport('/api/auth/password-reset',{method:'POST',body:{email:email.trim().toLowerCase(),code,password}}))},
    logout:async()=>{const token=refreshToken;epoch++;authEpoch++;clear();if(token)checked(await transport('/api/auth/logout',{method:'POST',body:{refreshToken:token}}))},
    refreshAccount: async () => {
      const session = epoch
      const revision = ++catalogRequest
      const next = await readAccount(p => request(p))
      assertCurrent(session)
      const models = revision < appliedCatalogRequest ? snapshot.models : next.models
      appliedCatalogRequest = Math.max(revision, appliedCatalogRequest)
      publish({ ...next, models })
      return snapshot
    },
    refreshModels,
    request,
  }
}
export const DEFAULT_CLOUD_ORIGIN=import.meta.env.VITE_CLOUD_API_ORIGIN
function configuredOrigin(){try{return originValue(localStorage.getItem('draivio-cloud-origin')||DEFAULT_CLOUD_ORIGIN)}catch{return originValue(DEFAULT_CLOUD_ORIGIN)}}
export const cloudAccount=createCloudAccount({origin:configuredOrigin()})
export function configureCloudOrigin(value:string){cloudAccount.configureOrigin(value);try{localStorage.setItem('draivio-cloud-origin',cloudAccount.getOrigin())}catch{/* Address stays session-only if storage is disabled. */}}
