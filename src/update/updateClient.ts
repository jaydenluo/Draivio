export const UPDATE_CHECK_KEY = 'draivio.update.last-check'
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

export type UpdateProgress = { phase: 'started' | 'downloading' | 'finished'; downloadedBytes: number; totalBytes?: number }

export type UpdateLike = {
  version: string
  body?: string
  downloadAndInstall: (onEvent?: (event: { event: 'Started' | 'Progress' | 'Finished'; data?: { contentLength?: number; chunkLength?: number } }) => void) => Promise<void>
  close?: () => Promise<void>
}

export type UpdateStorage = { get: (key: string) => string | null; set: (key: string, value: string) => void }

export type UpdateApi = {
  check: () => Promise<UpdateLike | null>
  isDesktop: () => boolean
  relaunch?: () => Promise<void>
  now: () => number
}

export type UpdateController = {
  checkForUpdate: (force?: boolean) => Promise<UpdateLike | null>
  install: (update: UpdateLike, onProgress?: (progress: UpdateProgress) => void) => Promise<void>
}

export function createUpdateController(api: UpdateApi, storage: UpdateStorage): UpdateController {
  const checkForUpdate = async (force = false) => {
    if (!api.isDesktop()) return null
    const previous = Number(storage.get(UPDATE_CHECK_KEY) ?? 0)
    if (!force && Number.isFinite(previous) && previous > 0 && api.now() - previous < UPDATE_CHECK_INTERVAL_MS) return null
    const update = await api.check()
    storage.set(UPDATE_CHECK_KEY, String(api.now()))
    return update
  }

  const install = async (update: UpdateLike, onProgress?: (progress: UpdateProgress) => void) => {
    let downloadedBytes = 0
    let totalBytes: number | undefined
    await update.downloadAndInstall(event => {
      if (event.event === 'Started') {
        totalBytes = event.data?.contentLength
        onProgress?.({ phase: 'started', downloadedBytes, totalBytes })
      } else if (event.event === 'Progress') {
        downloadedBytes += event.data?.chunkLength ?? 0
        onProgress?.({ phase: 'downloading', downloadedBytes, totalBytes })
      } else {
        onProgress?.({ phase: 'finished', downloadedBytes, totalBytes })
      }
    })
    await api.relaunch?.()
  }

  return { checkForUpdate, install }
}
