import { describe, expect, it } from 'vitest'
import { combineSelection, createSelection, drawSelectionRect, invertSelection, morphSelection, moveSelection, resizeSelection, selectionContains } from './selectionGeometry'

const a = createSelection('rectangle', { x: 10, y: 10, width: 30, height: 30 })
const b = createSelection('ellipse', { x: 30, y: 20, width: 30, height: 30 })

describe('selection geometry in artboard percentages', () => {
  it('normalizes a reverse drag and creates from the center with Alt', () => {
    expect(drawSelectionRect({ x: 40, y: 40 }, { x: 20, y: 30 })).toEqual({ x: 20, y: 30, width: 20, height: 10 })
    expect(drawSelectionRect({ x: 40, y: 40 }, { x: 50, y: 45 }, { fromCenter: true })).toEqual({ x: 30, y: 35, width: 20, height: 10 })
  })
  it('locks a physical square on a 4:5 artboard and clamps it without changing ratio', () => {
    const rect = drawSelectionRect({ x: 20, y: 20 }, { x: 50, y: 50 }, { ratio: 1, artboardRatio: 4 / 5 })
    expect(rect.width / rect.height).toBeCloseTo(1.25)
    const edge = drawSelectionRect({ x: 90, y: 90 }, { x: 100, y: 100 }, { ratio: 1, artboardRatio: 4 / 5, fromCenter: true })
    expect(edge.width / edge.height).toBeCloseTo(1.25)
    expect(edge.x + edge.width).toBeLessThanOrEqual(100)
    expect(edge.y + edge.height).toBeLessThanOrEqual(100)
  })
  it('uses ellipse geometry rather than its bounding box', () => {
    expect(selectionContains(b.path, { x: 31, y: 21 })).toBe(false)
    expect(selectionContains(b.path, { x: 45, y: 35 })).toBe(true)
  })
  it('preserves disjoint additions and the real boolean interior', () => {
    const add = combineSelection(a, b, 'add')
    expect(selectionContains(add.path, { x: 11, y: 11 })).toBe(true)
    expect(selectionContains(add.path, { x: 59, y: 21 })).toBe(false)
    const subtract = combineSelection(a, b, 'subtract')
    expect(selectionContains(subtract.path, { x: 38, y: 35 })).toBe(false)
    expect(selectionContains(subtract.path, { x: 31, y: 21 })).toBe(true)
    const intersect = combineSelection(a, b, 'intersect')
    expect(selectionContains(intersect.path, { x: 38, y: 35 })).toBe(true)
    expect(selectionContains(intersect.path, { x: 31, y: 21 })).toBe(false)
    expect(combineSelection(a, b, 'new').path).toEqual(b.path)
  })
  it('inverts within the artboard and expands or contracts the selected pixels', () => {
    const inverted = invertSelection(a)
    expect(selectionContains(inverted.path, { x: 20, y: 20 })).toBe(false)
    expect(selectionContains(inverted.path, { x: 90, y: 90 })).toBe(true)
    const expanded = morphSelection(a, 2)
    expect(selectionContains(expanded.path, { x: 9, y: 20 })).toBe(true)
    const contracted = morphSelection(a, -2)
    expect(selectionContains(contracted.path, { x: 11, y: 20 })).toBe(false)
    expect(selectionContains(contracted.path, { x: 20, y: 20 })).toBe(true)
    const hole = combineSelection(a, createSelection('ellipse', { x: 20, y: 20, width: 10, height: 10 }), 'subtract')
    expect(selectionContains(morphSelection(hole, 1).path, { x: 25, y: 25 })).toBe(false)
    expect(selectionContains(morphSelection(inverted, -1).path, { x: 10.5, y: 25 })).toBe(false)
  })
  it('moves and resizes shape geometry, including all handles and edges', () => {
    const moved = moveSelection(b, 5, 5)
    expect(moved.rect.x).toBe(35)
    expect(selectionContains(moved.path, { x: 50, y: 40 })).toBe(true)
    expect(selectionContains(moved.path, { x: 36, y: 26 })).toBe(false)
    for (const handle of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
      const resized = resizeSelection(a, handle, { x: 3, y: 4 })
      expect(resized.rect).not.toEqual(a.rect)
      expect(resized.rect.width).toBeGreaterThan(0)
      expect(resized.rect.height).toBeGreaterThan(0)
    }
  })
  it('keeps empty operands empty for subtraction/intersection and ignores empty transforms', () => {
    for (const mode of ['subtract', 'intersect'] as const) {
      const empty = combineSelection(null, a, mode)
      expect(selectionContains(empty.path, { x: 20, y: 20 })).toBe(false)
      expect(moveSelection(empty, 1, 1)).toEqual(empty)
      expect(resizeSelection(empty, 'se', { x: 1, y: 1 })).toEqual(empty)
    }
    expect(selectionContains(combineSelection(null, a, 'add').path, { x: 20, y: 20 })).toBe(true)
  })
})
