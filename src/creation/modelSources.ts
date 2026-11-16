import {cloudAccount} from '../account/cloudAccount'
import {getOfficialCloudConnection,officialModel} from '../account/cloudModels'
import { capabilitiesFor } from '../ai/providers/modelCapabilities'
import { getImageProtocol } from './imageProtocols'
import { useEffect, useSyncExternalStore } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { getBrowserConnections, loadConnections, saveConnections, type ServiceConnection } from './serviceConnections'

export type ModelSourceId = string
export type BillingMode = 'credits' | 'provider'

export type SourceModel = {
  code: string
  displayName: string
  supportsStrength?: boolean
}

export type ModelSource = {
  id: ModelSourceId
  providerName: string
  summary: string
  billingMode: BillingMode
  billingLabel: string
  protocolLabel?: string
  models: SourceModel[]
  enabled?: boolean
}

export const modelSources: ModelSource[] = [
  {
    id: 'draivio-cloud', providerName: 'Draivio 云端', summary: 'Draivio 云端 · 使用登录积分', billingMode: 'credits', billingLabel: '使用登录积分',
    models: [], enabled: false,
  },
  {
    id: 'openai-custom', providerName: 'OpenAI', summary: 'OpenAI · 自定义密钥', billingMode: 'provider', billingLabel: '费用由 OpenAI 账户承担', protocolLabel: '官方 API',
    models: [{ code: 'gpt-image-2.5', displayName: 'gpt-image-2.5' }],
  },
  {
    id: 'volcengine-custom', providerName: '火山引擎', summary: '火山引擎 · OpenAI 兼容', billingMode: 'provider', billingLabel: '费用由火山引擎账户承担', protocolLabel: 'OpenAI 兼容',
    models: [{ code: 'gpt-image-2.5', displayName: 'gpt-image-2.5' }],
  },
]

export function getSourceById(sourceId: string): ModelSource | undefined {
  return getAvailableSources().find((source) => source.id === sourceId) ?? modelSources.find((source) => source.id === sourceId)
}

let connections: ServiceConnection[] = []
let revision = 0
let initialized: Promise<void> | undefined
let loadError = ''
let ready = !isTauri()
const listeners = new Set<() => void>()
function notify() { revision++; listeners.forEach((listener) => listener()) }
export function getConnections(): ServiceConnection[] {
  if (!isTauri()) {
    return getBrowserConnections()
  }
  return connections
}
export function getAvailableSources(): ModelSource[] {
  const account=cloudAccount.getSnapshot()
  const official={...modelSources[0],enabled:account.authenticated,summary:account.authenticated?'Draivio 云端 · 官方账户积分':'Draivio 云端 · 请先登录',models:account.authenticated?account.models.filter(m=>!!officialModel(m.code,'image')).map(m=>({code:m.code,displayName:m.displayName})):[]}
  return [official, ...getConnections().map((connection) => ({
    id: connection.id, providerName: connection.provider, summary: `${connection.provider} · ${connection.name}`,
    billingMode: 'provider' as const, billingLabel: `由 ${connection.name} 计费`,
    protocolLabel: getImageProtocol(connection.protocol).label,
    models: connection.models.filter(code => capabilitiesFor(connection, code).image).map((code) => ({ code, displayName: code })), enabled: connection.enabled,
  }))]
}
export function isSourceUsable(sourceId: string, modelName: string) {
  return getAvailableSources().some((source) => source.id === sourceId && source.enabled !== false && source.models.some((model) => model.displayName === modelName))
}
export async function updateConnections(next: ServiceConnection[]) {
  if (!ready) throw new Error('配置尚未读取完成')
  await saveConnections(next)
  connections = next
  loadError = ''
  notify()
}
export function useServiceSources() {
  useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => revision)
  useEffect(() => {
    const unsubscribeCloud=cloudAccount.subscribe(notify)
    if (!initialized) initialized = loadConnections().then((value) => { connections = value; ready = true; loadError = ''; notify() }).catch(() => { loadError = '无法读取服务来源，请检查本地存储'; notify() })
    const storageChanged = () => notify()
    window.addEventListener('storage', storageChanged)
    return () => {window.removeEventListener('storage', storageChanged);unsubscribeCloud()}
  }, [])
  let error = loadError
  if (!isTauri()) { try { getBrowserConnections(true); error = '' } catch { error = '无法读取服务来源，请检查本地存储' } }
  return { connections: getConnections(), sources: getAvailableSources(), error, ready }
}

export function getModelsForSource(sourceId: string): SourceModel[] {
  return getSourceById(sourceId)?.models ?? []
}

/** Runtime-only official metadata is not part of saved custom-provider settings. */
export function getRuntimeConnections():ServiceConnection[]{const official=getOfficialCloudConnection();return [...(official?[official]:[]),...getConnections()]}
