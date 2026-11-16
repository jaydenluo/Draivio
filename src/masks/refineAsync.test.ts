import { describe, expect, it } from 'vitest'
import { alphaToSelection, cancelRefinementJob, createRefinementJob, refineAsync, selectionToAlpha } from './refineAsync'
import { createSelection, selectionContains } from '../canvas/selectionGeometry'
describe('refineAsync', () => {
  it('cancels when document revision changes', async () => {
    const job = createRefinementJob('d', '1'); const result = await refineAsync(new Uint8Array([255]), 1, 1, {}, job, () => ({ documentId: 'd', revision: '2' }))
    expect(result.cancelled).toBe(true); expect(result.result).toBeUndefined()
  })
  it('supports explicit cancellation', async () => {
    const job = createRefinementJob('d', '1'); cancelRefinementJob(job); const result = await refineAsync(new Uint8Array([255]), 1, 1, {}, job, () => ({ documentId: 'd', revision: '1' })); expect(result.cancelled).toBe(true)
  })
  it('emits a real low resolution alpha preview before full resolution work', async () => {
    const job = createRefinementJob('d', '1')
    let preview: Uint8Array | undefined
    const result = await refineAsync(new Uint8Array(400 * 400).fill(255), 400, 400, { feather: 2 }, job, () => ({ documentId: 'd', revision: '1' }), (alpha) => { preview = alpha })
    expect(preview).toBeInstanceOf(Uint8Array)
    expect(preview?.length).toBe(256 * 256)
    expect(result.previewWidth).toBe(256)
  })
  it('uses the same fringe correction semantics for RGBA preview pixels', async () => {
    const job = createRefinementJob('d', '1')
    let rgbaPreview: Uint8ClampedArray | undefined
    const rgba = new Uint8ClampedArray([255, 255, 255, 128, 20, 40, 60, 255])
    await refineAsync(new Uint8Array([128, 255]), 2, 1, { decontaminate: 100, colorCorrection: true }, job, () => ({ documentId: 'd', revision: '1' }), (_alpha, _w, _h, pixels) => { rgbaPreview = pixels }, rgba)
    expect(rgbaPreview).toBeInstanceOf(Uint8ClampedArray)
    expect(rgbaPreview?.length).toBe(8)
    expect(rgbaPreview?.[0]).not.toBe(255)
  })
  it('rasterizes and restores a selection without losing its bounds', () => {
    const source = createSelection('rectangle', { x: 20, y: 25, width: 40, height: 30 })
    const alpha = selectionToAlpha(source, 20, 20)
    const restored = alphaToSelection(alpha, 20, 20, source)
    expect(restored.path.type).toBe('raster')
    expect(restored.rect.x).toBeCloseTo(20, 0)
    expect(restored.rect.y).toBeCloseTo(25, 0)
    expect(selectionContains(restored.path, { x: 40, y: 40 })).toBe(true)
    expect(selectionContains(restored.path, { x: 5, y: 5 })).toBe(false)
  })
})
