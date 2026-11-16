import { expect, test } from 'vitest'
import { constrainComposerPosition } from './composerPosition'

test('snaps near the bottom above the footer controls', () => {
  expect(constrainComposerPosition({ x: 80, y: 325 }, { width: 900, height: 500 }, { width: 700, height: 100 })).toEqual({ x: 80, y: 344, snapped: true })
})
test('keeps freely dragged positions and clamps every edge', () => {
  expect(constrainComposerPosition({ x: 70, y: 80 }, { width: 900, height: 500 }, { width: 700, height: 100 })).toEqual({ x: 70, y: 80, snapped: false })
  expect(constrainComposerPosition({ x: -50, y: -20 }, { width: 900, height: 500 }, { width: 700, height: 100 })).toEqual({ x: 12, y: 12, snapped: false })
  expect(constrainComposerPosition({ x: 900, y: 500 }, { width: 900, height: 500 }, { width: 700, height: 100 })).toEqual({ x: 188, y: 344, snapped: true })
})
