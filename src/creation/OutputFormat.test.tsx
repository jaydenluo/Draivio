import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { AppShell } from '../app/AppShell'
import { EditorProvider, useEditor, type EditorState } from '../state/editor'

afterEach(() => vi.useRealTimers())

function setup() {
  let current: EditorState
  function Probe() { current = useEditor().state; return null }
  render(<EditorProvider><AppShell /><Probe /></EditorProvider>)
  return () => current!
}

function openFormat() {
  fireEvent.click(screen.getByRole('button', { name: '选择比例与分辨率' }))
  return screen.getByRole('dialog', { name: '比例与分辨率' })
}

test('replaces separate controls with nested ratio and resolution choices applied together', () => {
  const state = setup()
  expect(screen.queryByRole('button', { name: '选择尺寸' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '选择比例' })).not.toBeInTheDocument()
  const dialog = openFormat()
  fireEvent.click(within(dialog).getByRole('button', { name: '比例 16:9' }))
  expect(within(dialog).queryByRole('button', { name: '1024 × 1024' })).not.toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: '1920 × 1080' }))
  expect(state().composerParameters).toMatchObject({ ratio: '16:9', size: '1920 × 1080' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '选择比例与分辨率' })).toHaveTextContent('16:9 · 1920 × 1080')
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(state().composerParameters).toMatchObject({ ratio: '1:1', size: '1024 × 1024' })
  fireEvent.click(screen.getByRole('button', { name: '重做' }))
  expect(state().composerParameters).toMatchObject({ ratio: '16:9', size: '1920 × 1080' })
})

test('supports automatic resolution per ratio and fully automatic output across placements', () => {
  const state = setup()
  let dialog = openFormat()
  fireEvent.click(within(dialog).getByRole('button', { name: '比例 4:5' }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Auto 自动分辨率' }))
  expect(state().composerParameters).toMatchObject({ ratio: '4:5', size: 'auto' })
  fireEvent.click(screen.getByRole('button', { name: '移到右侧' }))
  expect(screen.getByRole('button', { name: '选择比例与分辨率' })).toHaveTextContent('4:5 · Auto')
  dialog = openFormat()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Auto 自动比例与分辨率' }))
  expect(state().composerParameters).toMatchObject({ ratio: 'auto', size: 'auto' })
  fireEvent.click(screen.getByRole('button', { name: '悬浮到画布底部' }))
  expect(screen.getByRole('button', { name: '选择比例与分辨率' })).toHaveTextContent('Auto')
})

test('captures the chosen format at submission and dismisses the picker with Escape', () => {
  vi.useFakeTimers()
  const state = setup()
  const dialog = openFormat()
  fireEvent.click(within(dialog).getByRole('button', { name: '比例 9:16' }))
  fireEvent.click(within(dialog).getByRole('button', { name: '1080 × 1920' }))
  fireEvent.click(screen.getByRole('button', { name: '执行 AI 操作' }))
  openFormat()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  act(() => vi.advanceTimersByTime(900))
  expect(state().layers[0].aiOperation?.parameters).toMatchObject({ ratio: '9:16', size: '1080 × 1920' })
})
