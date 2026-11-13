import type { ModelId } from './modelCatalog'

export type ModelStatus = 'uninstalled' | 'queued' | 'downloading' | 'verifying' | 'installed' | 'paused' | 'failed' | 'outdated'
export type ModelRecord = { modelId: ModelId; status: ModelStatus; downloadedBytes: number; totalBytes: number; error?: string }
export type ModelState = Record<ModelId, ModelRecord>
export type ModelAction =
  | { type: 'queue'; modelId: ModelId; totalBytes: number }
  | { type: 'progress'; modelId: ModelId; downloadedBytes: number; totalBytes: number }
  | { type: 'verify'; modelId: ModelId }
  | { type: 'install'; modelId: ModelId }
  | { type: 'pause'; modelId: ModelId }
  | { type: 'fail'; modelId: ModelId; error: string }
  | { type: 'reset'; modelId: ModelId }

export const initialModelState = (): ModelState => ({
  u2net: { modelId: 'u2net', status: 'uninstalled', downloadedBytes: 0, totalBytes: 176_000_000 },
  u2netp: { modelId: 'u2netp', status: 'uninstalled', downloadedBytes: 0, totalBytes: 5_000_000 },
  'rmbg-2.0': { modelId: 'rmbg-2.0', status: 'uninstalled', downloadedBytes: 0, totalBytes: 1_100_000_000 },
  'realesrgan-x4plus': { modelId: 'realesrgan-x4plus', status: 'uninstalled', downloadedBytes: 0, totalBytes: 65_000_000 },
  'realesrgan-anime': { modelId: 'realesrgan-anime', status: 'uninstalled', downloadedBytes: 0, totalBytes: 18_000_000 },
})

export function modelReducer(state: ModelState, action: ModelAction): ModelState {
  const current = state[action.modelId]
  if (!current) return state
  const update = (patch: Partial<ModelRecord>): ModelState => ({ ...state, [action.modelId]: { ...current, ...patch } })
  switch (action.type) {
    case 'queue': return current.status === 'installed' || current.status === 'downloading' || current.status === 'queued' ? state : update({ status: 'queued', downloadedBytes: current.downloadedBytes, totalBytes: action.totalBytes, error: undefined })
    case 'progress': return update({ status: 'downloading', downloadedBytes: Math.max(0, action.downloadedBytes), totalBytes: action.totalBytes })
    case 'verify': return update({ status: 'verifying' })
    case 'install': return update({ status: 'installed', downloadedBytes: current.totalBytes, error: undefined })
    case 'pause': return current.status === 'downloading' || current.status === 'queued' ? update({ status: 'paused' }) : state
    case 'fail': return update({ status: 'failed', error: action.error })
    case 'reset': return update({ status: 'uninstalled', downloadedBytes: 0, error: undefined })
  }
}

export function createModelManager(initial = initialModelState()) {
  let state = initial
  const pending = new Map<ModelId, Promise<void>>()
  const listeners = new Set<(state: ModelState) => void>()
  return {
    getState: () => state,
    subscribe: (listener: (state: ModelState) => void) => { listeners.add(listener); return () => listeners.delete(listener) },
    dispatch: (action: ModelAction) => { state = modelReducer(state, action); listeners.forEach((listener) => listener(state)) },
    pending,
  }
}
