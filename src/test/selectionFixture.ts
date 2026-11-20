import { fireEvent, screen } from '@testing-library/react'
import { vi } from 'vitest'

/** Establish a real selection explicitly instead of relying on demo document defaults. */
export function drawTestSelection() {
  const board = document.querySelector('.artboard')!
  vi.spyOn(board, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 500, height: 625, right: 500, bottom: 625, x: 0, y: 0, toJSON: () => ({}) })
  fireEvent.keyDown(window, { key: 'm' })
  const target = screen.getByLabelText('画布交互层')
  fireEvent.pointerDown(target, { pointerId: 98, clientX: 135, clientY: 162.5, button: 0 })
  fireEvent.pointerMove(target, { pointerId: 98, clientX: 365, clientY: 412.5, buttons: 1 })
  fireEvent.pointerUp(target, { pointerId: 98, clientX: 365, clientY: 412.5, button: 0 })
}
