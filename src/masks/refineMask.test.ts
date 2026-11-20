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

it('preserves exact edge filtering at borders for the sliding implementation', () => {
 const width = 7, height = 4
 const input = Uint8Array.from({ length: width * height }, (_, index) => (index * 31 + 54) % 256)
 const reference = (radius: number, operation: (values: number[]) => number) => Uint8Array.from(input, (_, index) => {
  const x = index % width, y = Math.floor(index / width)
  const values: number[] = []
  for (let py = Math.max(0, y - radius); py <= Math.min(height - 1, y + radius); py++) {
   for (let px = Math.max(0, x - radius); px <= Math.min(width - 1, x + radius); px++) values.push(input[py * width + px])
  }
  return operation(values)
 })
 for (const radius of [1, 2, 6, 32]) {
  expect(refineMaskAlpha(input, width, height, { smooth: radius })).toEqual(reference(radius, values => Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)))
  expect(shiftAlpha(input, width, height, radius)).toEqual(reference(radius, values => Math.max(...values)))
  expect(shiftAlpha(input, width, height, -radius)).toEqual(reference(radius, values => Math.min(...values)))
 }
})
