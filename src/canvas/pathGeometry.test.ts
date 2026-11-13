import { expect, test } from 'vitest'
import { addAnchor, closePath, moveAnchor, moveControl, pathBounds, pathToSvg, type EditorPath } from './pathGeometry'

test('builds a closed freehand or polygon path without duplicate endpoints', () => {
  let path: EditorPath = { kind: 'polygon', anchors: [], closed: false }
  path = addAnchor(path, { x: 10, y: 20 })
  path = addAnchor(path, { x: 80, y: 20 })
  expect(closePath(path).closed).toBe(false)
  path = addAnchor(path, { x: 40, y: 70 })
  const closed = closePath(path)
  expect(closed.closed).toBe(true)
  expect(pathToSvg(closed)).toBe('M 10 20 L 80 20 L 40 70 Z')
  expect(pathBounds(closed)).toEqual({ x: 10, y: 20, width: 70, height: 50 })
})

test('moving a bezier anchor translates its handles and preserves the curve', () => {
  let path: EditorPath = { kind: 'bezier', anchors: [], closed: false }
  path = addAnchor(path, { x: 10, y: 10 }, { x: 20, y: 10 })
  path = addAnchor(path, { x: 60, y: 60 })
  path = moveAnchor(path, 0, { x: 20, y: 25 })
  expect(path.anchors[0].out).toEqual({ x: 30, y: 25 })
  expect(path.anchors[0].in).toEqual({ x: 10, y: 25 })
  path = moveControl(path, 1, 'in', { x: 40, y: 50 })
  expect(pathToSvg(path)).toContain('C 30 25 40 50 60 60')
})

test('ignores empty or invalid path operations', () => {
  const path: EditorPath = { kind: 'freehand', anchors: [], closed: false }
  expect(pathToSvg(path)).toBe('')
  expect(pathBounds(path)).toBeNull()
  expect(moveAnchor(path, 8, { x: 2, y: 2 })).toEqual(path)
})

test('converts a closed bezier contour to a selection without flattening it to a bounding box', async () => {
  const { pathSelection } = await import('./selectionGeometry')
  const { selectionContains } = await import('./selectionGeometry')
  const path: EditorPath = { kind: 'bezier', closed: true, anchors: [{ x: 10, y: 10, out: { x: 40, y: 0 } }, { x: 80, y: 10 }, { x: 40, y: 80 }] }
  const selection = pathSelection(path)
  expect(selection.kind).toBe('path')
  expect(selectionContains(selection.path, { x: 40, y: 30 })).toBe(true)
  expect(selectionContains(selection.path, { x: 75, y: 75 })).toBe(false)
})
