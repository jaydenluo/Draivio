import { expect, test } from 'vitest'
import { appendBrushPoint, createBrushStroke, hitStroke, type BrushSettings } from './BrushEngine'

const settings: BrushSettings = { size: 24, hardness: 60, opacity: 50, flow: 80, smoothing: 30, color: '#ff765f' }

test('continuous strokes retain their brush settings and append smoothed points', () => {
  const stroke = createBrushStroke('one', 'paint', 'layer-a', { x: 10, y: 10 }, settings)
  const next = appendBrushPoint(stroke, { x: 30, y: 40 })
  expect(next.points).toHaveLength(2)
  expect(next.points[1].x).toBeGreaterThan(10)
  expect(next.points[1].x).toBeLessThan(30)
  expect(next).toMatchObject({ size: 24, hardness: 60, opacity: 50, flow: 80, layerId: 'layer-a' })
  expect(stroke.points).toHaveLength(1)
})

test('keeps pointer pressure and tilt on individual brush points', () => {
  const stroke = createBrushStroke('pressure', 'paint', 'layer-a', { x: 10, y: 10, pressure: .25, tiltX: 12, tiltY: -8 }, settings)
  const next = appendBrushPoint(stroke, { x: 30, y: 40, pressure: .9, tiltX: 20, tiltY: -10 })
  expect(next.points[0]).toMatchObject({ pressure: .25, tiltX: 12, tiltY: -8 })
  expect(next.points[1].pressure).toBeCloseTo(.9)
})

test('eraser hit testing checks line segments in physical canvas coordinates', () => {
  let stroke = createBrushStroke('two', 'paint', 'art', { x: 0, y: 50 }, { ...settings, smoothing: 0 })
  stroke = appendBrushPoint(stroke, { x: 100, y: 50 })
  expect(hitStroke(stroke, { x: 50, y: 51 }, 10)).toBe(true)
  expect(hitStroke(stroke, { x: 50, y: 80 }, 10)).toBe(false)
})
