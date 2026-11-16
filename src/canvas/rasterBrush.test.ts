import { expect, test } from 'vitest'
import { createBrushStroke } from './BrushEngine'
import { fillPixels, paintBrushStroke } from './rasterBrush'

const image = (color: [number, number, number, number] = [0, 0, 0, 0]) => ({ width: 7, height: 7, data: Uint8ClampedArray.from({ length: 7 * 7 * 4 }, (_, index) => color[index % 4]) })

test('paints a hard brush with pressure and leaves the source image untouched', () => {
  const source = image()
  const stroke = createBrushStroke('paint', 'paint', 'art', { x: 50, y: 50, pressure: 1 }, { size: 3, hardness: 100, opacity: 100, flow: 100, smoothing: 0, color: '#ff0000' })
  const result = paintBrushStroke(source, stroke)
  expect(result.data[(3 * 7 + 3) * 4 + 0]).toBe(255)
  expect(result.data[(3 * 7 + 3) * 4 + 3]).toBe(255)
  expect(source.data).toEqual(image().data)
})

test('eraser reduces alpha without changing RGB channels', () => {
  const source = image([20, 40, 60, 255])
  const stroke = createBrushStroke('erase', 'erase', 'art', { x: 50, y: 50, pressure: 1 }, { size: 3, hardness: 100, opacity: 50, flow: 100, smoothing: 0, color: '#000000' })
  const result = paintBrushStroke(source, stroke)
  const offset = (3 * 7 + 3) * 4
  expect(result.data[offset]).toBe(20)
  expect(result.data[offset + 3]).toBeLessThan(255)
})

test('fills only the selected pixels and blends the fill over alpha', () => {
  const source = image()
  const mask = new Uint8Array(7 * 7); mask[3 * 7 + 3] = 255
  const result = fillPixels(source, '#00ff00', mask)
  expect([...result.data.slice((3 * 7 + 3) * 4, (3 * 7 + 3) * 4 + 4)]).toEqual([0, 255, 0, 255])
  expect([...result.data.slice(0, 4)]).toEqual([0, 0, 0, 0])
})
