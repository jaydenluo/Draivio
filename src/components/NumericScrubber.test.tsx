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

test('forty drag changes form one transaction and pointer cancellation cancels it', () => {
  const start = vi.fn(), end = vi.fn(), cancel = vi.fn(), change = vi.fn()
  render(<NumericScrubber label="事务" value={0} onChange={change} onEditStart={start} onEditEnd={end} onEditCancel={cancel} />)
  const label = screen.getByRole('button', { name: '拖动调整事务' })
  fireEvent.pointerDown(label, { pointerId: 1, button: 0, clientX: 0 })
  for (let index = 1; index <= 40; index++) fireEvent.pointerMove(label, { pointerId: 1, clientX: index * 2 })
  fireEvent.pointerUp(label, { pointerId: 1 })
  expect(change).toHaveBeenCalledTimes(40)
  expect(start).toHaveBeenCalledTimes(1)
  expect(end).toHaveBeenCalledTimes(1)
  fireEvent.pointerDown(label, { pointerId: 2, button: 0, clientX: 0 })
  fireEvent.pointerMove(label, { pointerId: 2, clientX: 20 })
  fireEvent.pointerCancel(label, { pointerId: 2 })
  expect(cancel).toHaveBeenCalledTimes(1)
  expect(end).toHaveBeenCalledTimes(1)
})

test('typing commits on blur, Escape cancels without committing, and unmount cancels pending edits', () => {
  const start = vi.fn(), end = vi.fn(), cancel = vi.fn()
  const view = render(<NumericScrubber label="输入事务" value={20} onChange={vi.fn()} onEditStart={start} onEditEnd={end} onEditCancel={cancel} />)
  const input = screen.getByRole('spinbutton')
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: '3' } })
  fireEvent.change(input, { target: { value: '35' } })
  fireEvent.blur(input)
  expect(start).toHaveBeenCalledTimes(1)
  expect(end).toHaveBeenCalledTimes(1)
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: '60' } })
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(cancel).toHaveBeenCalledTimes(1)
  expect(end).toHaveBeenCalledTimes(1)
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: '80' } })
  view.unmount()
  expect(cancel).toHaveBeenCalledTimes(2)
})
