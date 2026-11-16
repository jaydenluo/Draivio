import { expect, test } from 'vitest'
import { pointerInput, pressureScale } from './pointerPressure'

test('uses a stable mouse pressure and preserves pen tilt data', () => {
  expect(pointerInput({ pressure: 0, tiltX: 0, tiltY: 0, pointerType: 'mouse' })).toMatchObject({ pressure: .5, pointerType: 'mouse' })
  expect(pointerInput({ pressure: .8, tiltX: 120, tiltY: -120, pointerType: 'pen' })).toMatchObject({ pressure: .8, tiltX: 90, tiltY: -90, pointerType: 'pen' })
})

test('maps pressure to a predictable brush scale', () => {
  expect(pressureScale(0)).toBeCloseTo(.35)
  expect(pressureScale(1)).toBeCloseTo(1)
  expect(pressureScale(.5)).toBeCloseTo(.675)
})
