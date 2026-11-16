import { describe, expect, it } from 'vitest'
import { createCmykDocument, convertRgbToCmyk, enforceInkLimit, totalInk, unsupportedRgbWorkingCopy } from './cmykDocument'

const profile = { id: 'gracol', name: 'GRACoL (placeholder)', totalInkLimit: 3 }

describe('CMYK document primitives', () => {
  it('keeps four real device channels and validates dimensions', () => {
    const doc = createCmykDocument(1, 1, new Uint8Array([0, 0, 0, 255]), profile)
    expect(doc.colorModel).toBe('cmyk')
    expect([...doc.pixels]).toEqual([0, 0, 0, 255])
    expect(() => createCmykDocument(1, 1, new Uint8Array(3), profile)).toThrow(/长度/)
  })

  it('enforces total ink without changing channels already within limit', () => {
    expect(totalInk([0, 0, 0, 255])).toBe(1)
    expect(enforceInkLimit([0, 0, 0, 255], 3)).toEqual([0, 0, 0, 255])
    expect(totalInk(enforceInkLimit([255, 255, 255, 255], 3))).toBeLessThanOrEqual(3)
  })

  it('retains an explicit warning for approximate RGB conversion', () => {
    const result = convertRgbToCmyk(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1, profile)
    expect(result.pixels).toHaveLength(4)
    expect(result.method).toBe('fallback')
    expect(result.reversible).toBe(false)
    expect(result.warnings.join(' ')).toMatch(/ICC/)
  })

  it('creates an RGB copy for unsupported CMYK operations', () => {
    expect(unsupportedRgbWorkingCopy('该滤镜不支持 CMYK').mode).toBe('rgb-copy')
    expect(unsupportedRgbWorkingCopy('该滤镜不支持 CMYK').warning).toMatch(/CMYK 文档模式未改变/)
  })
})
