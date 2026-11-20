import { validImagePricing, type ImagePricing } from '../ai/execution/generationJobs'
import { validCapabilities, type ModelCapabilities } from '../ai/providers/modelCapabilities'
import { validGenerationConfiguration, type GenerationConfiguration } from './generationOptions'
import { isTauri } from '@tauri-apps/api/core'
import { invokeCommand } from '../lib/native'
import { RequestError, requestProviderJson } from '../lib/request'
import { getImageProtocol, isImageProtocol, unsupportedTestMessage, type ImageProtocol } from './imageProtocols'
import { validImageCapabilities, type ImageModelCapabilities } from './imageEditCapabilities'

export type ServiceConnection = GenerationConfiguration & {
  id: string
  provider: string
  name: string
  baseUrl: string
  apiKey: string
  protocol: ImageProtocol
  models: string[]
  enabled: boolean
  modelCapabilities?: Record<string, ModelCapabilities>
  imageCapabilities?: Record<string, ImageModelCapabilities>
  imagePricing?: Record<string, ImagePricing>
  assistantModel?: string
}
const storageKey = 'draivio-service-connections-v1'
// Both the browser build and the desktop WebView use the same local persistent store.
// The native command layer is hydrated from this store so desktop requests can use the
// saved credentials after an application restart.
function readStoredConnections(): { raw: unknown; hasValue: boolean } {
  const stored = localStorage.getItem(storageKey)
  return { raw: JSON.parse(stored ?? '[]') as unknown, hasValue: stored !== null }
}
function writeStoredConnections(connections: ServiceConnection[]) {
  localStorage.setItem(storageKey, JSON.stringify(connections))
}

export function validateConnection(value: ServiceConnection): string {
  if(!validImagePricing(value.imagePricing))return '图片计费单价配置无效'
  if(!validImageCapabilities(value.imageCapabilities))return '图片编辑能力声明无效'
  if (!validCapabilities(value)) return '模型能力配置无效'
  if (!validGenerationConfiguration(value)) return '图片生成配置无效'
  if (!isImageProtocol(value.protocol)) return '请选择支持的图片协议'
  if (!value.name.trim() || !value.provider.trim()) return '请填写平台和名称'
  try {
    const url = new URL(value.baseUrl)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return '请填写有效的 HTTP(S) 地址，不含账号、查询参数或片段'
  } catch { return '请填写有效的 HTTP(S) 地址' }
  if (!value.apiKey.trim() || /[\r\n]/.test(value.apiKey)) return '请填写有效密钥'
  if (value.models.some((model) => !model.trim())) return '模型 ID 不能为空'
  return ''
}

export async function loadConnections(): Promise<ServiceConnection[]> {
  const stored = readStoredConnections()
  const raw = stored.raw
  if (!Array.isArray(raw)) throw new Error('来源配置损坏，请恢复本地配置')
  const allowEmptyApiKey = raw.some(item => item && typeof item === 'object' && !(item as Record<string, unknown>).apiKey)
  if (isTauri() && !stored.hasValue) {
    const native = decodeConnections(await invokeCommand('load_service_connections'))
    writeStoredConnections(native)
    return native
  }
  const connections = decodeConnections(raw, allowEmptyApiKey)
  if (isTauri() && connections.length) await invokeCommand('save_service_connections', { connections })
  return connections
}

export function getBrowserConnections(throwOnError = false): ServiceConnection[] {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    return decodeConnections(raw, true)
  } catch (error) { if (throwOnError) throw error; return [] }
}

export function decodeConnections(raw: unknown, allowEmptyApiKey = false): ServiceConnection[] {
  if (!Array.isArray(raw) || raw.some((item) => !item || typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.provider !== 'string' || typeof item.baseUrl !== 'string' || typeof item.apiKey !== 'string' || (!allowEmptyApiKey && !item.apiKey) || typeof item.enabled !== 'boolean' || !isImageProtocol(item.protocol) || !Array.isArray(item.models) || item.models.some((model: unknown) => typeof model !== 'string'))) throw new Error('来源配置损坏，请恢复本地配置')
  const connections = raw as ServiceConnection[]
  if (new Set(connections.map((item) => item.id)).size !== connections.length || connections.some((item) => !item.id || item.id === 'draivio-cloud' || (item.apiKey || !allowEmptyApiKey) && validateConnection(item))) throw new Error('来源配置损坏，请恢复本地配置')
  return connections
}

export async function saveConnections(connections: ServiceConnection[]) {
  if (new Set(connections.map((item) => item.id)).size !== connections.length) throw new Error('服务来源 ID 重复')
  for (const connection of connections) {
    const invalid = validateConnection(connection)
    if (invalid) throw new Error(invalid)
  }
  writeStoredConnections(connections)
  if (isTauri()) await invokeCommand('save_service_connections', { connections })
}

type ModelEndpoint = Pick<ServiceConnection, 'baseUrl' | 'apiKey' | 'protocol'> & Partial<ServiceConnection>

export async function fetchConnectionModels(connection: ModelEndpoint): Promise<string[]> {
  const invalid = validateConnection({ ...connection, id: 'fetch', provider: 'fetch', name: 'fetch', models: connection.models ?? [], enabled: true })
  if (invalid) throw new Error(invalid)
  if (!getImageProtocol(connection.protocol).listTest) throw new Error(unsupportedTestMessage)
  if (isTauri()) return invokeCommand('fetch_service_models', { baseUrl: connection.baseUrl, apiKey: connection.apiKey, protocol: connection.protocol })
  const gemini = connection.protocol === 'gemini'
  const ids = new Set<string>()
  const seen = new Set<string>()
  let cursor = ''
  for (let page = 0; page < 20; page++) {
    let response
    try {
      response = await requestProviderJson({ ...connection, path: 'models', query: cursor ? { [gemini ? 'pageToken' : 'after']: cursor } : {} })
    } catch (reason) {
      if (reason instanceof RequestError && reason.kind === 'timeout') throw new Error('模型列表请求超时，请稍后重试')
      throw reason
    }
    if ([401, 403].includes(response.status)) throw new Error('密钥无效或无访问权限')
    if (response.status < 200 || response.status >= 300) throw new Error(`连接失败（HTTP ${response.status}）`)
    const body = response.body as { models?: unknown; data?: unknown; nextPageToken?: unknown; has_more?: unknown; last_id?: unknown } | null
    const data: unknown = body?.[gemini ? 'models' : 'data']
    if (!Array.isArray(data)) throw new Error('接口未返回兼容的模型列表，请核对地址和协议')
    for (const item of data) {
      const id: unknown = gemini ? item?.name : item?.id
      if (typeof id === 'string' && id.trim()) ids.add(gemini ? id.trim().replace(/^models\//, '') : id.trim())
    }
    const next: unknown = gemini ? body?.nextPageToken : body?.has_more === true ? body.last_id ?? data.at(-1)?.id : ''
    if (!next && !(body?.has_more === true && !gemini)) return [...ids]
    if (typeof next !== 'string' || !next.trim() || seen.has(next)) throw new Error('模型列表分页异常，请检查供应商接口')
    seen.add(next); cursor = next
  }
  throw new Error('模型列表超过 20 页，请按供应商文档手动填写模型 ID')
}

export async function testConnection(connection: ServiceConnection): Promise<string> {
  const invalid = validateConnection(connection)
  if (invalid) throw new Error(invalid)
  await fetchConnectionModels(connection)
  return '模型列表可访问；生图权限以实际请求为准'
}
