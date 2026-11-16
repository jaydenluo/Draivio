import { expect, test } from 'vitest'
import { resizeTextObject } from './textTransformGeometry'
import type { CanvasTextObject } from './TextObject'

const text: CanvasTextObject = { id: 'small', layerId: 'art', x: 20, y: 30, text: '文字', fontFamily: 'sans-serif', fontSize: 12, fontWeight: '400', color: '#fff', align: 'left', width: 192, height: 36 }
const box = { width: 24, height: 16.8 }

test('small point text uses visible bounds rather than the stored creation box', () => {
  const next = resizeTextObject(text, 'se', { x: 24, y: 0 }, box, 500, 625)
  expect(next.fontSize).toBeCloseTo(24)
  expect(next.width).toBeCloseTo(48)
  expect(next.height).toBeCloseTo(33.6)
})

test.each(['se', 'ne', 'sw', 'nw'])('a horizontal inward %s drag can shrink small text without vertical movement', (handle) => {
  const next = resizeTextObject(text, handle, { x: handle.includes('w') ? 12 : -12, y: 0 }, box, 500, 625)
  expect(next.fontSize).toBeCloseTo(6)
  expect(next.width).toBeCloseTo(12)
  expect(next.height).toBeCloseTo(8.4)
  expect(next.x).toBeCloseTo(handle.includes('w') ? 22.4 : 20)
  expect(next.y).toBeCloseTo(handle.includes('n') ? 31.344 : 30)
})

test('point text edge handles resize the font, paragraph edge handles only resize its box', () => {
  expect(resizeTextObject(text, 'e', { x: 12, y: 0 }, box, 500, 625).fontSize).toBeCloseTo(18)
  const paragraph = { ...text, layout: 'paragraph' as const }
  const next = resizeTextObject(paragraph, 'e', { x: 12, y: 0 }, box, 500, 625)
  expect(next.fontSize).toBe(12)
  expect(next.width).toBe(36)
  expect(next.height).toBe(16.8)
})

test('rotated text resizes along its visual axis and preserves the opposite corner', () => {
  const rotated = { ...text, rotation: 90 }
  const next = resizeTextObject(rotated, 'nw', { x: 0, y: 12 }, box, 500, 625)
  expect(next.fontSize).toBeCloseTo(6)
  expect(next.x).toBeCloseTo(20 - 8.4 / 500 * 100)
  expect(next.y).toBeCloseTo(30 + 12 / 625 * 100)
})

test('shrinking past the anchor keeps finite positive font size and bounds', () => {
  const next = resizeTextObject(text, 'se', { x: -100, y: -100 }, box, 500, 625)
  expect(next.fontSize).toBe(1)
  expect(next.width).toBeGreaterThan(0)
  expect(next.height).toBeGreaterThan(0)
})
