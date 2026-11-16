import type { RasterWorkerRequest } from '../../engine/raster/rasterWorker'
import { createRasterComposite } from '../../engine/raster/composite'
import type { PixelImage } from '../../canvas/rasterTools'

export type ProcessingOptions = {
 signal?: AbortSignal
 execution?: 'auto' | 'cooperative'
 chunkRows?: number
 maxPixels?: number
 maxBytes?: number
 onProgress?: (fraction: number) => void
}
export type ProcessingResult = { image: PixelImage; elapsedMs: number; peakBytes: number; chunks: number; maxTaskMs: number; workerMaxTaskMs?: number }
export const MAX_PROCESSING_PIXELS = 16_777_216
const abortIfNeeded = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException('处理已取消', 'AbortError') }
export function processingLimit(width: number, height: number, maxPixels = MAX_PROCESSING_PIXELS) {
 if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || !Number.isSafeInteger(maxPixels) || maxPixels < 1 || width * height > maxPixels) return { allowed: false, reason: `图像超过当前设备处理上限（${maxPixels} 像素），请先缩小或分块` }
 return { allowed: true }
}
/** Shared cancellation checkpoint used by real AI tile assembly as well as
 * compositing. The injected yield is only for deterministic host scheduling. */
export async function yieldProcessing(signal?: AbortSignal, pause?: () => Promise<void>) {
 abortIfNeeded(signal)
 await (pause?.() ?? new Promise<void>(resolve => setTimeout(resolve, 0)))
 abortIfNeeded(signal)
}
/** Compute real pixel ranges between yields, never a dummy progress loop then
 * one uninterruptible full-image composite. The synchronous reference shares
 * the same pixel implementation, so preview/export do not diverge. */
export async function processRaster(request: RasterWorkerRequest, options: ProcessingOptions = {}): Promise<ProcessingResult> {
 const limit = processingLimit(request.width, request.height, options.maxPixels)
 if (!limit.allowed) throw new Error(limit.reason)
 if (options.chunkRows !== undefined && (!Number.isInteger(options.chunkRows) || options.chunkRows < 1)) throw new Error('分块行数无效')
 abortIfNeeded(options.signal)
 const inputBytes = request.layers.reduce((n, layer) => n + layer.image.data.byteLength + (layer.mask?.byteLength ?? 0), 0)
 const usesWorker = options.execution !== 'cooperative' && typeof Worker !== 'undefined'
 const expectedBytes = request.width * request.height * 4 + inputBytes * (usesWorker ? 2 : 1), maxBytes = options.maxBytes ?? 256 * 1024 * 1024
 if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || expectedBytes > maxBytes) throw new Error('图像超出处理内存预算，请缩小预览或减少图层')
 if (options.execution !== 'cooperative' && typeof Worker !== 'undefined') {
  const started = performance.now()
  let worker: Worker
  try { worker = new Worker(new URL('./processingWorker.ts', import.meta.url), { type: 'module' }) }
  catch { return processRaster(request, { ...options, execution: 'cooperative' }) }
  return new Promise<ProcessingResult>((resolve, reject) => {
   let closed = false
   const finish = () => { if (closed) return; closed = true; options.signal?.removeEventListener('abort', abort); worker.terminate() }
   const abort = () => { finish(); reject(new DOMException('处理已取消', 'AbortError')) }
   options.signal?.addEventListener('abort', abort, { once: true })
   worker.onerror = () => { finish(); reject(new Error('栅格 Worker 失败，未发布部分结果')) }
   let maxTaskMs = 0
   worker.onmessage = (event: MessageEvent<{ progress?: number; result?: ProcessingResult; error?: string }>) => {
    if (closed) return
    if (options.signal?.aborted) { abort(); return }
    if (event.data.error) { finish(); reject(new Error(event.data.error)); return }
    try {
     if (event.data.progress !== undefined) options.onProgress?.(event.data.progress)
     abortIfNeeded(options.signal)
     if (event.data.result) {
      const result = event.data.result
      finish()
      resolve({ ...result, elapsedMs: performance.now() - started, peakBytes: result.peakBytes + request.layers.reduce((n, layer) => n + layer.image.data.byteLength + (layer.mask?.byteLength ?? 0), 0), workerMaxTaskMs: result.maxTaskMs, maxTaskMs })
     }
    } catch (error) { finish(); reject(error) }
   }
   try {
    // Clone the source; transfer only the result back. Caller-owned pixels
    // remain attached for comparison, cancellation and undo.
    worker.postMessage({ request, options: { chunkRows: options.chunkRows, maxPixels: options.maxPixels, maxBytes: options.maxBytes } })
    maxTaskMs = performance.now() - started
    if (options.signal?.aborted) abort()
   } catch (error) { finish(); reject(error) }
  })
 }
 const started = performance.now(), session = createRasterComposite(request.width, request.height, request.layers)
 let maxTaskMs = performance.now() - started, chunks = 0, rows = Math.min(request.height, options.chunkRows ?? 32)
 const pixels = request.width * request.height, count = session.layerCount
 try {
  for (let layer = 0; layer < count; layer++) {
   for (let cursor = 0; cursor < pixels;) {
    abortIfNeeded(options.signal)
    const taskStart = performance.now(), end = Math.min(pixels, cursor + rows * request.width, cursor + 262_144)
    const next = session.compositeRange(layer, cursor, end, taskStart + 8)
    chunks++
    const duration = performance.now() - taskStart
    maxTaskMs = Math.max(maxTaskMs, duration)
    cursor = next
    options.onProgress?.((layer * pixels + cursor) / (count * pixels))
    abortIfNeeded(options.signal)
    // Target 8ms of actual computation. The first slice is small so cold-JIT
    // work cannot hide in an initial giant task. Explicit chunkRows is a cap.
    rows = Math.max(1, Math.min(options.chunkRows ?? 256, Math.floor(rows * Math.min(2, 8 / Math.max(.1, duration)))))
    if (layer < count - 1 || cursor < pixels) await yieldProcessing(options.signal)
   }
  }
  abortIfNeeded(options.signal)
  if (!count) options.onProgress?.(1)
  abortIfNeeded(options.signal)
  return { image: session.image, elapsedMs: performance.now() - started, peakBytes: session.image.data.byteLength + request.layers.reduce((n, l) => n + l.image.data.byteLength + (l.mask?.byteLength ?? 0), 0), chunks, maxTaskMs }
 } catch (error) { disposeRaster(session.image); throw error }
}
/** Clear an owned result when cancelled or undone. The owner must also drop
 * its reference; clearing bytes alone is not evidence of garbage collection. */
export function disposeRaster(image: PixelImage) { image.data.fill(0) }
