import { describe, expect, it } from 'vitest'
import { applyColorAdjustments, applyColorPipeline, linearToSrgb, srgbToLinear, whiteBalanceFromSample } from './colorPipeline'
import { histogramRGBA } from './histogram'
describe('color pipeline', () => {
  it('keeps neutral values and maps one EV in linear light', () => { expect(linearToSrgb(srgbToLinear(.5))).toBeCloseTo(.5, 5); expect(applyColorAdjustments({ r: .5, g: .5, b: .5, a: 1 })).toEqual({ r: .5, g: .5, b: .5, a: 1 }); expect(applyColorAdjustments({ r: .5, g: .5, b: .5, a: 1 }, { exposureEV: 1 }).r).toBeCloseTo(linearToSrgb(srgbToLinear(.5) * 2), 5) })
  it('derives neutralizing gains from a gray sample', () => { const gains = whiteBalanceFromSample({ r: .4, g: .5, b: .6 }); expect(gains.r).toBeGreaterThan(1); expect(gains.b).toBeLessThan(1); const out = applyColorAdjustments({ r: .4, g: .5, b: .6, a: 1 }, { whiteBalance: gains }); expect(out.r).toBeCloseTo(out.b, 2) })
  it('counts RGB/luminance, transparent pixels and clipping in a selection', () => { const pixels = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 42, 10, 20, 0, 8, 9, 10, 255]); const h = histogramRGBA(pixels, 2, 2, { x: 0, y: 0, width: 2, height: 1 }); expect(h.samples).toBe(2); expect(h.transparent).toBe(0); expect(h.red[0]).toBe(1); expect(h.clipped.highlights).toBe(1) })
  it('does not mutate source pixels', () => { const source = new Uint8ClampedArray([128, 128, 128, 255]); const output = applyColorPipeline(source, 1, 1, { exposureEV: 1 }); expect(source[0]).toBe(128); expect(output[0]).toBeGreaterThan(128) })
})
