import { describe, expect, it } from 'vitest'
import { layerPoint, selectionToLayer, type LayerAffine, type TransformDraft } from './layerCoordinates'
import { createSelection, selectionContains, type Selection } from './selectionGeometry'

const transform = (overrides: Partial<TransformDraft> = {}): TransformDraft => ({ kind: 'transform', rect: { x: 20, y: 10, width: 60, height: 80 }, rotation: 0, flipX: false, flipY: false, ...overrides })
const close = (actual: { x: number; y: number }, expected: { x: number; y: number }) => { expect(actual.x).toBeCloseTo(expected.x, 5); expect(actual.y).toBeCloseTo(expected.y, 5) }

describe('layer coordinates use CanvasScene physical 500x625 transforms', () => {
  it('maps the document center to the layer center and maps corners with scale', () => {
    close(layerPoint({ x: 50, y: 50 }, transform()), { x: 50, y: 50 })
    close(layerPoint({ x: 0, y: 0 }, transform()), { x: 20, y: 10 })
    close(layerPoint({ x: 100, y: 100 }, transform()), { x: 80, y: 90 })
  })
  it('round trips arbitrary points through inverse, rotation, and flips', () => {
    for (const draft of [transform({ rotation: 32 }), transform({ flipX: true, flipY: true }), transform({ rotation: -47, flipX: true })]) {
      for (const point of [{ x: 7, y: 12 }, { x: 50, y: 50 }, { x: 92, y: 81 }]) close(layerPoint(layerPoint(point, draft), draft, true), point)
    }
  })
  it('uses physical pixels so a square source scales differently on the 4:5 artboard', () => {
    const draft = transform({ rect: { x: 10, y: 20, width: 20, height: 20 } })
    close(layerPoint({ x: 0, y: 0 }, draft), { x: 10, y: 20 })
    close(layerPoint({ x: 100, y: 100 }, draft), { x: 30, y: 40 })
  })
  it('rejects invalid coordinates, singular transforms, and malformed drafts', () => {
    expect(() => layerPoint({ x: -1, y: 10 }, transform())).toThrow(Error)
    expect(() => layerPoint({ x: 10, y: 10 }, transform({ rect: { x: 0, y: 0, width: 0, height: 20 } }))).toThrow(Error)
    expect(() => layerPoint({ x: 10, y: 10 }, transform({ rotation: Number.NaN }))).toThrow(Error)
  })
})

describe('selectionToLayer wraps existing geometry in an inverse affine expression', () => {
  it('maps selection bounds to transformed corners and retains affine hit testing', () => {
    const selection = createSelection('ellipse', { x: 10, y: 20, width: 30, height: 20 })
    const draft = transform({ rotation: 90 })
    const mapped = selectionToLayer(selection, draft)
    expect(mapped.path.type).toBe('affine')
    expect(mapped.rect.width).toBeCloseTo(41.6667)
    expect(mapped.rect.height).toBeCloseTo(30)
    expect(selectionContains(mapped.path, layerPoint({ x: 25, y: 30 }, draft, true))).toBe(true)
    expect(selectionContains(mapped.path, layerPoint({ x: 80, y: 80 }, draft, true))).toBe(false)
  })
  it('supports boolean, path, and raster expressions without flattening them', () => {
    const left = createSelection('rectangle', { x: 40, y: 40, width: 15, height: 15 })
    const right = createSelection('ellipse', { x: 45, y: 45, width: 15, height: 15 })
    const boolean: Selection = { ...left, path: { type: 'boolean', mode: 'add', left: left.path, right: right.path } }
    const mapped = selectionToLayer(boolean, transform({ rotation: 20, flipX: true }))
    expect(mapped.path.type).toBe('affine')
    expect((mapped.path as LayerAffine).source.type).toBe('boolean')
    expect(selectionContains(mapped.path, layerPoint({ x: 50, y: 50 }, transform({ rotation: 20, flipX: true }), true))).toBe(true)
  })
  it('leaves selection unchanged when no layer transform is provided', () => {
    const selection = createSelection('rectangle', { x: 10, y: 20, width: 30, height: 40 })
    expect(selectionToLayer(selection)).toEqual(selection)
  })
})
