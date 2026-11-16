import { describe, expect, it } from 'vitest'
import { applyExposureLinear, applyLinearColorPipeline, applyWhiteBalanceLinear, linearToSrgb, srgbToLinear, whiteBalanceGains } from './colorPipeline'
describe('linear color pipeline', () => {
 it('round trips transfer functions and keeps neutral defaults unchanged', () => { for (const value of [0, .01, .18, .5, 1]) expect(linearToSrgb(srgbToLinear(value))).toBeCloseTo(value, 6); const rgba = new Uint8ClampedArray([18,128,240,99]); expect(applyLinearColorPipeline(rgba)).toEqual(rgba) })
 it('applies one EV stop as a 2x linear-light exposure while preserving alpha', () => { const input = new Uint8ClampedArray([64,128,200,77]), output = applyExposureLinear(input, 1); expect(srgbToLinear(output[0] / 255)).toBeCloseTo(srgbToLinear(input[0] / 255) * 2, 2); expect(output[3]).toBe(77) })
 it('matches the independent sRGB gray128 one-stop expectation', () => { const output = applyExposureLinear(new Uint8ClampedArray([128,128,128,123]), 1); expect(output[0]).toBeGreaterThanOrEqual(175); expect(output[0]).toBeLessThanOrEqual(177); expect(output[1]).toBe(output[0]); expect(output[2]).toBe(output[0]); expect(output[3]).toBe(123) })
 it('neutralizes a gray sample with channel gains in linear light', () => { const input = new Uint8ClampedArray([180,140,100,255]), gains = whiteBalanceGains({ r: 180 / 255, g: 140 / 255, b: 100 / 255 }), output = applyWhiteBalanceLinear(input, gains); expect(output[0]).toBeCloseTo(output[1], 0); expect(output[1]).toBeCloseTo(output[2], 0) })
})
