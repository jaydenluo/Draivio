import { describe, expect, test } from 'vitest'
import { removeBackground, upscalePixels } from './enhancement'

describe('image enhancement operations', () => {
  test('removes corner-connected background while preserving the subject', () => {
    const data = new Uint8ClampedArray(Array.from({ length: 9 }, (_, index) => index === 4 ? [255, 0, 0, 255] : [255, 255, 255, 255]).flat())
    const result = removeBackground({ width: 3, height: 3, data }, 8)
    expect(result.data[3]).toBe(0)
    expect(result.data[4 * 4 + 3]).toBe(255)
  })

  test('upscales pixels by an integer factor', () => {
    const result = upscalePixels({ width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]) }, 2)
    expect(result).toMatchObject({ width: 4, height: 2 })
    expect([...result.data.slice(0, 8)]).toEqual([255, 0, 0, 255, 255, 0, 0, 255])
  })
})
