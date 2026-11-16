import { describe, expect, it } from 'vitest'
import { clippingWarning, histogramRGBA } from './histogram'
describe('RGBA histogram', () => {
 const data = new Uint8ClampedArray([0,10,20,255, 255,240,220,255, 99,88,77,0, 30,40,50,255])
 it('counts channels, alpha and clipping without transparent pixels by default', () => { const h = histogramRGBA(data, 2, 2); expect(h.samples).toBe(3); expect(h.alpha[0]).toBe(1); expect(h.red[0]).toBe(1); expect(h.clipped.shadows).toBe(1); expect(h.clipped.highlights).toBe(1); expect(clippingWarning(h).message).toContain('剪裁') })
 it('restricts samples to a rectangle and can include transparent pixels', () => { const h = histogramRGBA(data, 2, 2, { selection: { x: 1, y: 0, width: 1, height: 2 }, includeTransparent: true }); expect(h.samples).toBe(2); expect(h.alpha[0]).toBe(0); expect(h.red[255]).toBe(1) })
 it('honors a real coverage mask instead of reducing a path to its bounds', () => { const h = histogramRGBA(data, 2, 2, { mask: new Uint8Array([255, 0, 0, 0]) }); expect(h.samples).toBe(1); expect(h.red[0]).toBe(1); expect(h.red[255]).toBe(0) })
})
