import { describe, expect, it } from 'vitest'
import { compositeLayers, solidImage } from './composite'
import { RasterSurface } from './RasterSurface'

describe('raster compositing', () => {
  it('composites alpha and mask without changing source pixels', () => {
    const source = solidImage(2, 1, [255, 0, 0, 255])
    const output = compositeLayers(2, 1, [{ image: source, opacity: .5, mask: new Uint8Array([255, 0]) }])
    expect([...output.data]).toEqual([255, 0, 0, 128, 0, 0, 0, 0])
    expect([...source.data]).toEqual([255, 0, 0, 255, 255, 0, 0, 255])
  })

  it.each([
    ['multiply', [64, 0, 0]], ['screen', [192, 0, 0]], ['overlay', [128, 0, 0]],
  ] as const)('supports %s blend mode', (blendMode, expected) => {
    const output = compositeLayers(1, 1, [{ image: solidImage(1, 1, [128, 0, 0, 255]) }, { image: solidImage(1, 1, [128, 0, 0, 255]), blendMode }])
    expect([...output.data.slice(0, 3)]).toEqual(expected)
  })

  it('provides a mutable surface with clone and clear operations', () => {
    const surface = RasterSurface.from(solidImage(1, 1, [12, 34, 56, 255]))
    const copy = surface.clone()
    surface.clear()
    expect([...copy.toImage().data]).toEqual([12, 34, 56, 255])
    expect([...surface.toImage().data]).toEqual([0, 0, 0, 0])
  })
})
