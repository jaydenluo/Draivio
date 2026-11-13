import { isTauri } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { getModel, type ModelId } from './modelCatalog'
import type { ModelState } from './modelManager'

export type ModelProgress = { modelId: ModelId; downloadedBytes: number; totalBytes: number }
export type ModelApi = {
  getState: () => Promise<ModelState>
  start: (modelId: ModelId) => Promise<void>
  pause: (modelId: ModelId) => Promise<void>
  cancel: (modelId: ModelId) => Promise<void>
  remove: (modelId: ModelId) => Promise<void>
  onProgress: (listener: (progress: ModelProgress) => void) => Promise<UnlistenFn>
}
const invokeCommand = <T>(command: string, args?: Record<string, unknown>) => invoke<T>(command, args)

const browserState: ModelState = {
  u2net: { modelId: 'u2net', status: 'uninstalled', downloadedBytes: 0, totalBytes: getModel('u2net').sizeBytes },
  u2netp: { modelId: 'u2netp', status: 'uninstalled', downloadedBytes: 0, totalBytes: getModel('u2netp').sizeBytes },
  'rmbg-2.0': { modelId: 'rmbg-2.0', status: 'uninstalled', downloadedBytes: 0, totalBytes: getModel('rmbg-2.0').sizeBytes },
  'realesrgan-x4plus': { modelId: 'realesrgan-x4plus', status: 'uninstalled', downloadedBytes: 0, totalBytes: getModel('realesrgan-x4plus').sizeBytes },
  'realesrgan-anime': { modelId: 'realesrgan-anime', status: 'uninstalled', downloadedBytes: 0, totalBytes: getModel('realesrgan-anime').sizeBytes },
}

const browserTasks = new Map<ModelId, ReturnType<typeof setInterval>>()
const progressListeners = new Set<(progress: ModelProgress) => void>()

const browserApi: ModelApi = {
  getState: async () => structuredClone(browserState),
  start: async (modelId) => {
    if (browserTasks.has(modelId)) return
    const record = browserState[modelId]
    record.status = 'downloading'
    const step = Math.max(1, Math.round(record.totalBytes / 20))
    browserTasks.set(modelId, setInterval(() => {
      record.downloadedBytes = Math.min(record.totalBytes, record.downloadedBytes + step)
      progressListeners.forEach((listener) => listener({ modelId, downloadedBytes: record.downloadedBytes, totalBytes: record.totalBytes }))
      if (record.downloadedBytes >= record.totalBytes) { record.status = 'installed'; const task = browserTasks.get(modelId); if (task) clearInterval(task); browserTasks.delete(modelId) }
    }, 100))
  },
  pause: async (modelId) => { browserState[modelId].status = 'paused'; const task = browserTasks.get(modelId); if (task) clearInterval(task); browserTasks.delete(modelId) },
  cancel: async (modelId) => { const task = browserTasks.get(modelId); if (task) clearInterval(task); browserTasks.delete(modelId); browserState[modelId].status = 'uninstalled'; browserState[modelId].downloadedBytes = 0 },
  remove: async (modelId) => { browserState[modelId].status = 'uninstalled'; browserState[modelId].downloadedBytes = 0 },
  onProgress: async (listener) => { progressListeners.add(listener); return () => progressListeners.delete(listener) },
}

export const modelApi: ModelApi = isTauri() ? {
  getState: () => invokeCommand<ModelState>('model_status'),
  start: (modelId) => invokeCommand<void>('model_download', { modelId }),
  pause: (modelId) => invokeCommand<void>('model_pause', { modelId }),
  cancel: (modelId) => invokeCommand<void>('model_cancel', { modelId }),
  remove: (modelId) => invokeCommand<void>('model_delete', { modelId }),
  onProgress: (listener) => listen<ModelProgress>('model-progress', (event) => listener(event.payload)),
} : browserApi

export async function ensureModelInstalled(modelId: ModelId): Promise<void> {
  const state = await modelApi.getState()
  if (state[modelId]?.status !== 'installed') await modelApi.start(modelId)
}
