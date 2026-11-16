import { expect, test } from 'vitest'
import { createSelection, invertSelection } from './selectionGeometry'
import { rasterizeSelectionMask } from './selectionRaster'

test('rasterizes rectangle and ellipse selections with antialiased edges', () => {
  const rectangle = rasterizeSelectionMask(createSelection('rectangle', { x: 25, y: 25, width: 50, height: 50 }), 4, 4)
  expect(rectangle[0]).toBe(0)
  expect(rectangle[5]).toBe(255)
  const ellipse = rasterizeSelectionMask(createSelection('ellipse', { x: 0, y: 0, width: 100, height: 100 }), 4, 4)
  expect(ellipse[0]).toBeLessThan(255)
  expect(ellipse[5]).toBe(255)
})

test('supports inverted selections and feathering without mutating the selection', () => {
  const selection = createSelection('rectangle', { x: 25, y: 25, width: 50, height: 50 }, { feather: 1 })
  const inverted = rasterizeSelectionMask(invertSelection(selection), 8, 8)
  expect(inverted[0]).toBe(255)
  expect(inverted[27]).toBeLessThan(255)
  expect(selection.path.type).toBe('shape')
})
