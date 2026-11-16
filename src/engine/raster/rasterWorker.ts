import { compositeLayers, type RasterLayerInput } from './composite'

export type RasterWorkerRequest = { width: number; height: number; layers: RasterLayerInput[] }
export type RasterWorkerResponse = { width: number; height: number; data: Uint8ClampedArray } | { error: string }

export function renderRasterJob(request: RasterWorkerRequest) { return compositeLayers(request.width, request.height, request.layers) }

const workerScope = globalThis as typeof globalThis & { importScripts?: unknown; onmessage?: (event: MessageEvent<RasterWorkerRequest>) => void; postMessage?: (message: RasterWorkerResponse, transfer?: Transferable[]) => void }
if (typeof workerScope.importScripts === 'function') {
  workerScope.onmessage = (event) => {
    try {
      const result = renderRasterJob(event.data)
      workerScope.postMessage?.(result, [result.data.buffer])
    } catch (error) {
      workerScope.postMessage?.({ error: error instanceof Error ? error.message : '栅格任务失败' })
    }
  }
}
