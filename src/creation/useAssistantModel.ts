import { useSyncExternalStore } from 'react'
import { assistantModels, selectedAssistant, type AssistantSelection } from '../ai/providers/modelCapabilities'
import { getRuntimeConnections, useServiceSources } from './modelSources'

const storageKey = 'draivio-assistant-selection-v1'
const changeEvent = 'draivio:assistant-selection'
const read = () => { try { return localStorage.getItem(storageKey) ?? '' } catch { return '' } }
const subscribe = (listener: () => void) => {
  window.addEventListener(changeEvent, listener)
  window.addEventListener('storage', listener)
  return () => { window.removeEventListener(changeEvent, listener); window.removeEventListener('storage', listener) }
}

/** Persist only model identity; used by explicit choices and login defaults. */
export function saveAssistantSelection(selection: AssistantSelection | null) {
  if (selection) localStorage.setItem(storageKey, JSON.stringify(selection))
  else localStorage.removeItem(storageKey)
  window.dispatchEvent(new Event(changeEvent))
}

/** Shared reasoning preference; only model identity is persisted. */
export function useAssistantModel() {
  const { sources, error, ready } = useServiceSources('text')
  const stored = useSyncExternalStore(subscribe, read)
  const connections = getRuntimeConnections()
  const choices = assistantModels(connections).filter(choice => sources.some(source => source.id === choice.sourceId && source.enabled && source.models.some(model => model.code === choice.model)))
  let preference: AssistantSelection | null = null
  try {
    const value: unknown = JSON.parse(stored)
    if (value && typeof value === 'object' && 'sourceId' in value && 'model' in value && typeof value.sourceId === 'string' && typeof value.model === 'string') preference = { sourceId: value.sourceId, model: value.model }
  } catch { /* Older installations use assistantModel on their service records. */ }
  const legacy = selectedAssistant(connections)
  const selected = preference ? choices.find(choice => choice.sourceId === preference.sourceId && choice.model === preference.model) : choices.find(choice => choice.sourceId === legacy?.sourceId && choice.model === legacy.model) ?? choices[0]
  const source = sources.find(item => item.id === selected?.sourceId)
  const label = source?.models.find(model => model.code === selected?.model)?.displayName ?? (preference ? '推理模型不可用' : '选择推理模型')
  const choose = (selection: AssistantSelection | null) => {
    if (selection && !choices.some(choice => choice.sourceId === selection.sourceId && choice.model === selection.model)) throw new Error('推理模型不可用，请检查来源、密钥与文本推理能力')
    saveAssistantSelection(selection)
  }
  return { selected, choices, label, source, choose, error, ready }
}
