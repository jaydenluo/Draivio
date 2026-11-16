import { describe, expect, it } from 'vitest'
import { decontaminateFringe, refineMaskAlpha, shiftAlpha } from './refineMask'
describe('refineMask', () => {
  it('expands, feathers and applies bounded density deterministically', () => {
    const input = new Uint8Array([0, 0, 0, 255, 255, 0, 0, 0, 0])
    const output = refineMaskAlpha(input, 3, 3, { shift: 1, feather: 1, density: 50 })
    expect([...output].every(value => value >= 0 && value <= 255)).toBe(true)
    expect(output).toEqual(refineMaskAlpha(input, 3, 3, { shift: 1, feather: 1, density: 50 }))
  })
  it('contracts with negative shift', () => expect(shiftAlpha(new Uint8Array(9).fill(255), 3, 3, -1)[4]).toBe(255))
  it('keeps source intact and independently corrects white fringe', () => {
    const source = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255])
    const alpha = new Uint8Array([255, 128])
    const corrected = decontaminateFringe(source, alpha, 2, 1, 100, true)
    expect([...source]).toEqual([0, 0, 0, 255, 255, 255, 255, 255])
    expect(corrected[4]).toBeLessThan(255)
  })
})
