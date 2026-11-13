import { fireEvent, render, screen } from '@testing-library/react'
import { test, expect } from 'vitest'
import { AppShell } from '../app/AppShell'
import { EditorProvider } from '../state/editor'

test('resizes the inspector with the canvas divider', () => {
  render(<EditorProvider><AppShell /></EditorProvider>)
  const divider = screen.getByRole('separator', { name: '调整画布和操作面板宽度' })
  expect(divider).toHaveAttribute('aria-valuenow', '320')
  fireEvent.pointerDown(divider, { clientX: 800 })
  fireEvent.pointerMove(window, { clientX: 600 })
  expect(divider).toHaveAttribute('aria-valuenow', '424')
  fireEvent.pointerUp(window)
})
