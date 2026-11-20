import {cloudAccount} from '../../account/cloudAccount'
import type { ServiceConnection } from '../../creation/serviceConnections'

export type ModelCapabilities = { image: boolean; text: boolean; vision: boolean }
export type AssistantSelection = { sourceId: string; model: string }
export type AssistantModel = AssistantSelection & { label: string; vision: boolean }
const unclassified: ModelCapabilities = { image: false, text: false, vision: false }

/** Only known model families get a default purpose; input vision is always declared separately. */
function inferredCapabilities(model: string): ModelCapabilities {
  const name = model.trim().toLowerCase().replace(/^models\//, '').split('/').at(-1) ?? ''
  // Audio, embedding and ranking endpoints belong to neither of these pickers.
  if (/(?:^|[-_.])(embedding|embed|rerank|tts|transcribe|transcription|audio|realtime|whisper|moderation)(?:[-_.]|$)/.test(name)) return { ...unclassified }
  if (/(?:^|[-_.])image(?:[-_.]|$)/.test(name) || /^(?:dall-e|flux|seedream|imagen|ideogram|stable-diffusion|sdxl)(?:[-_.]|$)/.test(name)) return { image: true, text: false, vision: false }
  if (/^(?:gpt-\d|chatgpt-\d|o[1-9](?:[-.]|$)|claude[-.]|deepseek[-.]|qwen(?:\d|[-.])|gemini[-.]|glm[-.])/.test(name)) return { image: false, text: true, vision: false }
  return { ...unclassified }
}

/** Explicit per-source declarations override defaults; listing a model never grants tool permissions. */
export function capabilitiesFor(connection: ServiceConnection, model: string): ModelCapabilities {
  const declared = connection.modelCapabilities?.[model]
  if (declared) return declared
  if (connection.id === 'draivio-cloud') return { ...unclassified }
  if (connection.imageCapabilities?.[model]) return { image: true, text: false, vision: false }
  return inferredCapabilities(model)
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
  if (selection && !assistantModels(connections).some(model => model.sourceId === selection.sourceId && model.model === selection.model)) throw new Error('推理模型不可用，请检查来源、密钥与文本推理能力')
  return connections.map(connection => {
    const { assistantModel: _previous, ...rest } = connection
    return selection?.sourceId === connection.id ? { ...rest, assistantModel: selection.model } : rest
  })
}
