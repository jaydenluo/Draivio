import { expect, test } from 'vitest'
import { resizeTransformRect } from './transformGeometry'
import type { SelectionRect } from './selectionGeometry'

const rect = { x: 20, y: 20, width: 40, height: 50 }
const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

function oppositePoint(value: SelectionRect, handle: string, rotation: number, ratio: number) {
  const x = (handle.includes('w') ? 1 : handle.includes('e') ? -1 : 0) * value.width * ratio / 2
  const y = (handle.includes('n') ? 1 : handle.includes('s') ? -1 : 0) * value.height / 2
  const angle = rotation * Math.PI / 180
  return {
    x: (value.x + value.width / 2) * ratio + x * Math.cos(angle) - y * Math.sin(angle),
    y: value.y + value.height / 2 + x * Math.sin(angle) + y * Math.cos(angle),
  }
}

test.each([0, 30, 90, 180, 270])('all eight handles retain the opposite point at %s degrees on a nonsquare artboard', (rotation) => {
  for (const handle of handles) {
    const next = resizeTransformRect(rect, handle, { x: 8, y: -6 }, rotation, false)
    const before = oppositePoint(rect, handle, rotation, .8)
    const after = oppositePoint(next, handle, rotation, .8)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
    expect(next.width).toBeGreaterThan(0)
    expect(next.height).toBeGreaterThan(0)
  }
})

test('rotated Shift corners preserve both the ratio and opposite corner', () => {
  for (const handle of ['nw', 'ne', 'sw', 'se']) {
    const next = resizeTransformRect(rect, handle, { x: 12, y: 15 }, 35, true)
    expect(next.width / next.height).toBeCloseTo(rect.width / rect.height)
    const before = oppositePoint(rect, handle, 35, .8)
    const after = oppositePoint(next, handle, 35, .8)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  }
})

test('unrotated proportional enlargement stops at the artboard edge', () => {
  const next = resizeTransformRect(rect, 'se', { x: 200, y: 0 }, 0, true)
  expect(next.x).toBeCloseTo(20)
  expect(next.y).toBeCloseTo(20)
  expect(next.y + next.height).toBeCloseTo(100)
  expect(next.x + next.width).toBeLessThanOrEqual(100)
  expect(next.width / next.height).toBeCloseTo(rect.width / rect.height)
})

test('rotation uses the supplied artboard proportions', () => {
  const next = resizeTransformRect(rect, 'e', { x: 0, y: 10 }, 90, false, 2)
  expect(next.width).toBeCloseTo(45)
  expect(next.x).toBeCloseTo(17.5)
  expect(next.y).toBeCloseTo(25)
})
