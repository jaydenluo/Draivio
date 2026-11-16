import {cloudAccount} from '../../account/cloudAccount'
import type { ServiceConnection } from '../../creation/serviceConnections'

export type ModelCapabilities = { image: boolean; text: boolean; vision: boolean }
export type AssistantSelection = { sourceId: string; model: string }
export type AssistantModel = AssistantSelection & { label: string; vision: boolean }
const legacyCapabilities: ModelCapabilities = { image: true, text: false, vision: false }

/** Capabilities are user declarations; a model-list response never grants tool permissions. */
export function capabilitiesFor(connection: ServiceConnection, model: string): ModelCapabilities {
  return connection.modelCapabilities?.[model] ?? { ...legacyCapabilities }
}
export function validCapabilities(connection: ServiceConnection): boolean {
  const map = connection.modelCapabilities
  if (map !== undefined && (!map || typeof map !== 'object' || Array.isArray(map) || Object.entries(map).some(([model, value]) =>
    !connection.models.includes(model) || !value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).some(key => !['image', 'text', 'vision'].includes(key)) ||
    !['image', 'text', 'vision'].every(key => typeof value[key as keyof ModelCapabilities] === 'boolean')))) return false
  return connection.assistantModel === undefined || (typeof connection.assistantModel === 'string' && connection.models.includes(connection.assistantModel) && capabilitiesFor(connection, connection.assistantModel).text)
}
export function assistantModels(connections: ServiceConnection[]): AssistantModel[] {
  return connections.flatMap(connection => connection.enabled && (connection.id==='draivio-cloud'?cloudAccount.getSnapshot().authenticated:connection.apiKey.trim()) ? connection.models.flatMap(model => {
    const capability = capabilitiesFor(connection, model)
    return capability.text ? [{ sourceId: connection.id, model, label: `${model} · ${connection.provider} · ${connection.name}`, vision: capability.vision }] : []
  }) : [])
}
export function selectedAssistant(connections: ServiceConnection[]): AssistantModel | null {
  return assistantModels(connections).find(model => connections.find(connection => connection.id === model.sourceId)?.assistantModel === model.model) ?? null
}
/** Store the separate preference in the same native/browser source records as its account. */
export function selectAssistant(connections: ServiceConnection[], selection: AssistantSelection | null): ServiceConnection[] {
  if (selection && !assistantModels(connections).some(model => model.sourceId === selection.sourceId && model.model === selection.model)) throw new Error('助手模型不可用，请检查来源、密钥与文本推理能力')
  return connections.map(connection => {
    const { assistantModel: _previous, ...rest } = connection
    return selection?.sourceId === connection.id ? { ...rest, assistantModel: selection.model } : rest
  })
}
