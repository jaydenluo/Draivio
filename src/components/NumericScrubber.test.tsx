import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { NumericScrubber } from './NumericScrubber'

function renderScrubber(value = 20) {
  const onChange = vi.fn()
  render(<NumericScrubber label="大小" value={value} min={1} max={100} unit="px" onChange={onChange} />)
  return onChange
}

test('supports direct input, clamping, and visible stepper buttons', () => {
  const onChange = renderScrubber()
  const input = screen.getByRole('spinbutton', { name: '大小' })
  fireEvent.change(input, { target: { value: '120' } })
  expect(input).toHaveValue(100)
  expect(onChange).toHaveBeenLastCalledWith(100)
  fireEvent.click(screen.getByRole('button', { name: '减少大小' }))
  expect(onChange).toHaveBeenLastCalledWith(99)
  expect(screen.getByText('px')).toBeInTheDocument()
})

test('supports keyboard, wheel, and horizontal label scrubbing', () => {
  const onChange = renderScrubber()
  const input = screen.getByRole('spinbutton', { name: '大小' })
  fireEvent.keyDown(input, { key: 'ArrowUp', shiftKey: true })
  expect(onChange).toHaveBeenLastCalledWith(30)
  fireEvent.wheel(input, { deltaY: -20 })
  expect(onChange).toHaveBeenLastCalledWith(31)
  const label = screen.getByRole('button', { name: '拖动调整大小' })
  fireEvent.pointerDown(label, { pointerId: 1, button: 0, clientX: 100 })
  fireEvent.pointerMove(label, { pointerId: 1, clientX: 110 })
  fireEvent.pointerUp(label, { pointerId: 1, clientX: 110 })
  expect(onChange).toHaveBeenLastCalledWith(25)
})
