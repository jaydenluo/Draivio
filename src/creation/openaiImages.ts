import { message } from '../ui/message'
import { negotiateGenerativeRoute, type GenerativeOperation } from '../ai/tools/generativeTools'
import { isTauri } from '@tauri-apps/api/core'
import { invokeCommand } from '../lib/native'
import { requestProviderJson } from '../lib/request'
import type { ServiceConnection } from './serviceConnections'
import type { GenerationOptions } from './generationOptions'
import { filterImageParameters, type ImageModelCapabilities } from './imageEditCapabilities'
import { cloudAccount } from '../account/cloudAccount'
import { officialModel } from '../account/cloudModels'

export class ImageRequestError extends Error {
  constructor(message: string, public uncertain: boolean, public status?: number, public retryAfter = 1000) { super(message) }
}
export type ImageIntent = 'generate' | 'edit' | 'reference'
export type ImageInput = { expectedCloudSession?:number; signal?:AbortSignal; operation?: GenerativeOperation; model: string; prompt: string; count: number; size: string; options: GenerationOptions; intent?: ImageIntent; reference?: string; mask?: string; parameters?: { quality?: string; steps?: number; guidance?: number; strength?: number }; capabilities?: ImageModelCapabilities }
export function imagePayload(input: ImageInput) {
  const filtered=input.capabilities?filterImageParameters({...(input.options.sendSize?{size:input.size}:{}),quality:input.options.quality==='omit'?undefined:input.options.quality,...input.parameters},input.capabilities):{...(input.options.sendSize?{size:input.size}:{}),...(input.options.quality!=='omit'?{quality:input.options.quality}:{})}
  return {model:input.model,prompt:input.prompt,...(input.options.multiImage==='single'?{n:input.count}:{}),...filtered,...(filtered.size?{size:filtered.size.replace(/\s/g,'').replace('×','x')}: {})}
}
export function imageEditPayload(input: ImageInput) {
  if (!input.reference) throw new ImageRequestError('编辑请求缺少参考图', false)
  const capabilities = input.capabilities ?? { generate: true, edit: true, reference: true, encoding: 'base64-json' as const, quality: ['auto', 'low', 'medium', 'high'] as const }
  const filtered = filterImageParameters({ ...(input.options.sendSize?{size:input.size}:{}), quality: input.options.quality === 'omit' ? undefined : input.options.quality, ...input.parameters }, capabilities)
  return { model: input.model, prompt: input.prompt, image: input.reference, ...(input.mask ? { mask: input.mask } : {}), ...(input.options.multiImage === 'single' ? { n: input.count } : {}), ...filtered, ...(filtered.size ? { size: filtered.size.replace(/\s/g, '').replace('×', 'x') } : {}) }
}
/** Fixed multipart contract used by documented OpenAI image edit endpoints. */
export function imageEditFormData(input: ImageInput): FormData {
  const payload = imageEditPayload(input)
  const pngBytes = (source: unknown) => {
    if(typeof source!=='string'||!source.startsWith('data:image/png;base64,'))throw new ImageRequestError('参考图和蒙版必须为 PNG 文件数据',false)
    let bytes:Uint8Array<ArrayBuffer>
    try { bytes=Uint8Array.from(atob(source.slice('data:image/png;base64,'.length)),c=>c.charCodeAt(0)) }
    catch { throw new ImageRequestError('PNG 编码无效',false) }
    if(bytes.length<24||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)||String.fromCharCode(...bytes.slice(12,16))!=='IHDR')throw new ImageRequestError('参考图和蒙版必须是有效 PNG，不会发送伪装图片',false)
    const view=new DataView(bytes.buffer)
    if(!view.getUint32(16)||!view.getUint32(20))throw new ImageRequestError('PNG 尺寸无效',false)
    return bytes
  }
  const image=pngBytes(input.reference),mask=input.mask?pngBytes(input.mask):undefined
  if(mask&&!image.slice(16,24).every((v,i)=>v===mask[16+i]))throw new ImageRequestError('参考图与蒙版尺寸必须一致',false)
  const form = new FormData()
  Object.entries(payload).forEach(([key, value]) => {
    if(key==='image'||key==='mask')form.append(key,new Blob([key==='image'?image:mask!],{type:'image/png'}),`${key}.png`)
    else form.append(key,String(value))
  })
  return form
}
export type ImageResults = (string | null)[]
const MAX_IMAGE_BASE64 = 32 * 1024 * 1024
function isPublicImageUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
    const host = url.hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false
    return true
  } catch { return false }
}
export function parseImageResponse(value: unknown): ImageResults {
  const data = (value as { data?: unknown })?.data
  if (!Array.isArray(data) || !data.length) throw new ImageRequestError('接口未返回图片，结果未知，请先检查供应商记录', true)
  return data.map(item => {
    if (typeof item?.b64_json === 'string' && item.b64_json.length <= MAX_IMAGE_BASE64 && /^[A-Za-z0-9+/]+={0,2}$/.test(item.b64_json) && item.b64_json.length % 4 === 0) return `data:image/png;base64,${item.b64_json}`
    if (typeof item?.url === 'string') {
      if (isPublicImageUrl(item.url) && item.url.length <= 4096) return item.url
    }
    return null
  })
}
export async function generateOpenAIImages(connection: ServiceConnection, input: ImageInput): Promise<ImageResults> {
  const intent=input.intent??'generate'
  const operation=input.operation??(intent==='generate'?'generate':input.mask?(input.prompt.trim()?'fill':'remove'):'reference')
  let route:ReturnType<typeof negotiateGenerativeRoute>
  try{route=negotiateGenerativeRoute(connection,input,operation)}catch(error){throw new ImageRequestError(error instanceof Error?error.message:'图片能力协商失败',false)}
  if (route.ignoredParameters.length) {
    const labels:Record<string,string>={steps:'步数',guidance:'引导强度',strength:'编辑强度',quality:'画质'}
    message.warning(`模型未声明支持，未发送：${route.ignoredParameters.map(key=>labels[key]??key).join('、')}`,{key:'image-ignored-parameters'})
  }
  const capabilities=route.capabilities,editing=route.path==='images/edits'
  const normalized={...input,capabilities,...(route.size?{size:route.size}:{})}
  const payload=editing?imageEditPayload(normalized):imagePayload(normalized)
  const requestBody=editing&&route.encoding==='multipart'?imageEditFormData(normalized):payload
  let response: { status: number; body: unknown; retryAfter?: number }
  if (connection.id === 'draivio-cloud') {
    if (editing) throw new ImageRequestError('官方目录未声明真实蒙版编辑契约；不会退回整图生成', false)
    if (!officialModel(input.model, 'image')) throw new ImageRequestError('官方模型不可用或未声明图片能力', false)
    if(input.expectedCloudSession!==undefined&&input.expectedCloudSession!==cloudAccount.getSessionVersion())throw new ImageRequestError('云端账号已更改，未提交请求，请重新报价',false)
    try {
      response = await cloudAccount.request('/api/model-gateway/v1/images/generations', { method:'POST', body:payload, signal:input.signal, timeoutMs:180000, headers:{'Idempotency-Key':crypto.randomUUID()} })
    } catch { throw new ImageRequestError('云端请求中断，扣费与结果状态未知；请先查看账号使用记录，不要重复提交', true) }
    finally { void cloudAccount.refreshAccount().catch(()=>message.warning('云端余额刷新失败，请稍后手动刷新',{key:'cloud-balance'})) }
  } else if (isTauri()) {
    try { response = await invokeCommand('generate_openai_images', { connectionId: connection.id, path: route.path, payload, multipart:editing && route.encoding==='multipart' }) }
    catch { throw new ImageRequestError('请求中断或超时，结果未知，请先检查供应商记录', true) }
  } else {
    try {
      response = await requestProviderJson({ ...connection, path: route.path, method: 'POST', body: requestBody, signal:input.signal, timeoutMs: 180000 })
    } catch { throw new ImageRequestError('网络、跨域或超时导致结果未知，请先检查供应商记录', true) }
  }
  if (response.status === 429) throw new ImageRequestError('请求受限，已降低并发，请稍后重试失败项', false, 429, response.retryAfter)
  if ([402,403].includes(response.status)) {
    const code = typeof (response.body as any)?.code === 'string' ? (response.body as any).code : typeof (response.body as any)?.error?.code === 'string' ? (response.body as any).error.code : ''
    if (['insufficient_quota', 'quota_exceeded', 'INSUFFICIENT_CREDITS'].includes(code)) throw new ImageRequestError('供应商额度不足，请充值或切换服务来源', false, response.status)
  }
  if ([401, 403].includes(response.status)) throw new ImageRequestError('密钥无效或无生图权限', false, response.status)
  if (response.status < 200 || response.status >= 300) throw new ImageRequestError(`生图请求失败（HTTP ${response.status}）${response.status >= 500 ? '，结果未知，请先检查供应商记录' : '，请核对参数和模型'}`, response.status >= 500 || response.status === 408, response.status)
  return parseImageResponse(response.body)
}
