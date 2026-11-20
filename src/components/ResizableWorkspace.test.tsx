import { fireEvent, render, screen, within } from '@testing-library/react'
import { test, expect, vi } from 'vitest'
import { AppShell } from '../app/AppShell'
import { EditorProvider } from '../state/editor'

test('resizes the inspector with the canvas divider', () => {
  render(<EditorProvider><AppShell /></EditorProvider>)
  const divider = screen.getByRole('separator', { name: '调整画布和操作面板宽度' })
  expect(divider).toHaveAttribute('aria-valuenow', '320')
  fireEvent.pointerDown(divider, { clientX: 800 })
  fireEvent.pointerMove(window, { clientX: 600 })
  expect(divider).toHaveAttribute('aria-valuenow', '364')
  fireEvent.pointerUp(window)
})

test('opens the requested inspector tab from the compact rail and restores the dock when widened', () => {
  const width = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(800)
  try {
    render(<EditorProvider><AppShell /></EditorProvider>)
    const rail = screen.getByRole('navigation', { name: '面板快捷入口' })
    const properties = within(rail).getByRole('button', { name: '属性' })
    expect(properties).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('complementary', { name: '操作面板' })).toBeNull()
    fireEvent.click(properties)
    expect(properties).toHaveAttribute('aria-expanded', 'true')
    expect(within(screen.getByRole('navigation', { name: '操作面板标签' })).getByRole('button', { name: '属性' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('button', { name: '收起操作面板' }))
    expect(properties).toHaveFocus()
    fireEvent.keyDown(window, { key: 'F7' })
    expect(screen.getByRole('complementary', { name: '操作面板' })).toBeInTheDocument()
    width.mockReturnValue(1280)
    fireEvent(window, new Event('resize'))
    expect(screen.queryByRole('navigation', { name: '面板快捷入口' })).toBeNull()
    expect(screen.getByRole('separator', { name: '调整画布和操作面板宽度' })).toBeInTheDocument()
  } finally { width.mockRestore() }
})
