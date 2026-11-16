import { refineMaskAlpha, type RefineMaskParameters } from './refineMask'
import { selectionContains, type Selection } from '../canvas/selectionGeometry'
import { decontaminateFringe } from './refineMask'

export type RefinementJob = { documentId: string; revision: string; cancelled: boolean; controller: AbortController }
export function createRefinementJob(documentId: string, revision: string): RefinementJob { return { documentId, revision, cancelled: false, controller: new AbortController() } }
export function cancelRefinementJob(job: RefinementJob) { job.cancelled = true; job.controller.abort() }

export function selectionToAlpha(selection: Selection, width: number, height: number): Uint8Array {
  const alpha = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    alpha[y * width + x] = selectionContains(selection.path, { x: (x + .5) / width * 100, y: (y + .5) / height * 100 }) ? 255 : 0
  }
  return alpha
}

export function alphaToSelection(alpha: Uint8Array, width: number, height: number, source: Selection): Selection {
  const rows: string[] = []
  let minX = width, minY = height, maxX = 0, maxY = 0
  for (let y = 0; y < height; y++) {
    let row = ''
    for (let x = 0; x < width; x++) {
      const selected = alpha[y * width + x] > 0
      row += selected ? '1' : '0'
      if (selected) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x + 1); maxY = Math.max(maxY, y + 1) }
    }
    rows.push(row)
  }
  const rect = maxX ? { x: minX / width * 100, y: minY / height * 100, width: (maxX - minX) / width * 100, height: (maxY - minY) / height * 100 } : { x: 0, y: 0, width: 0, height: 0 }
  return { ...source, kind: 'path', rect, path: { type: 'raster', rows, d: '', alpha: Array.from(alpha), alphaWidth: width, alphaHeight: height }, feather: source.feather }
}

/** Low resolution preview followed by cancellable full-resolution computation. */
export async function refineAsync(input: Uint8Array, width: number, height: number, params: RefineMaskParameters, job: RefinementJob, current: () => { documentId: string; revision: string }, onPreview?: (preview: Uint8Array, width: number, height: number, previewRgba?: Uint8ClampedArray) => void, sourceRgba?: Uint8ClampedArray): Promise<{ preview: Uint8Array; previewWidth: number; previewHeight: number; previewRgba?: Uint8ClampedArray; result?: Uint8Array; cancelled: boolean }> {
  const previewWidth = Math.max(1, Math.min(256, width)), previewHeight = Math.max(1, Math.min(256, height))
  const previewInput = new Uint8Array(previewWidth * previewHeight)
  for (let y = 0; y < previewHeight; y++) for (let x = 0; x < previewWidth; x++) previewInput[y * previewWidth + x] = input[Math.floor(y * height / previewHeight) * width + Math.floor(x * width / previewWidth)]
  const preview = refineMaskAlpha(previewInput, previewWidth, previewHeight, params)
  let previewRgba: Uint8ClampedArray | undefined
  if (sourceRgba && sourceRgba.length === width * height * 4) {
    previewRgba = new Uint8ClampedArray(previewWidth * previewHeight * 4)
    for (let y = 0; y < previewHeight; y++) for (let x = 0; x < previewWidth; x++) {
      const src = (Math.floor(y * height / previewHeight) * width + Math.floor(x * width / previewWidth)) * 4
      const dst = (y * previewWidth + x) * 4
      previewRgba.set(sourceRgba.subarray(src, src + 4), dst)
    }
    previewRgba = decontaminateFringe(previewRgba, preview, previewWidth, previewHeight, params.decontaminate ?? 0, params.colorCorrection ?? false)
  }
  onPreview?.(preview, previewWidth, previewHeight, previewRgba)
  await Promise.resolve()
  if (job.cancelled || JSON.stringify(current()) !== JSON.stringify({ documentId: job.documentId, revision: job.revision })) return { preview, previewWidth, previewHeight, previewRgba, cancelled: true }
  await new Promise<void>(resolve => setTimeout(resolve, 0))
  if (job.cancelled || JSON.stringify(current()) !== JSON.stringify({ documentId: job.documentId, revision: job.revision })) return { preview, previewWidth, previewHeight, previewRgba, cancelled: true }
  if (job.cancelled || job.controller.signal.aborted) return { preview, previewWidth, previewHeight, previewRgba, cancelled: true }
  const result = await runFullResolution(input, width, height, params, job)
  return { preview, previewWidth, previewHeight, previewRgba, result: result ?? undefined, cancelled: !result }
}

async function runFullResolution(input: Uint8Array, width: number, height: number, params: RefineMaskParameters, job: RefinementJob): Promise<Uint8Array | null> {
  if (job.controller.signal.aborted) return null
  if (typeof Worker !== 'undefined') {
    return new Promise(resolve => {
      const worker = new Worker(new URL('./refineWorker.ts', import.meta.url), { type: 'module' })
      const stop = () => { worker.terminate(); resolve(null) }
      job.controller.signal.addEventListener('abort', stop, { once: true })
      worker.onmessage = event => { job.controller.signal.removeEventListener('abort', stop); worker.terminate(); resolve(new Uint8Array(event.data)) }
      worker.onerror = () => { job.controller.signal.removeEventListener('abort', stop); worker.terminate(); resolve(null) }
      worker.postMessage({ input, width, height, params }, [input.buffer])
    })
  }
  await new Promise<void>(resolve => setTimeout(resolve, 0))
  if (job.controller.signal.aborted) return null
  return refineMaskAlpha(input, width, height, params)
}
