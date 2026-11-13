import { fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { test, expect, vi, afterEach } from 'vitest'
import { AppShell } from '../app/AppShell'
import { EditorProvider, initialEditorState, useEditor, type EditorState } from '../state/editor'

afterEach(() => vi.useRealTimers())

test('uses one AI composer for generation and editing', () => {
  render(<EditorProvider><AppShell /></EditorProvider>)
  expect(screen.getByRole('button', { name: '切换到生成新内容' })).toHaveTextContent('修改当前图')
  fireEvent.click(screen.getByRole('button', { name: '切换到生成新内容' }))
  expect(screen.getByRole('button', { name: '切换到修改当前图' })).toHaveTextContent('生成新内容')
  expect(screen.getByPlaceholderText('描述你想要的画面')).toBeInTheDocument()
})

test('opens a parameter popover from the AI composer', () => {
  render(<EditorProvider><AppShell /></EditorProvider>)
  fireEvent.click(screen.getByRole('button', { name: '选择模型' }))
  expect(screen.getByRole('dialog', { name: '模型参数' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '模型：Image Pro' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Image Fast' }))
  expect(screen.getByRole('button', { name: '选择模型' })).toHaveTextContent('Image Fast')
})

test('submitting the AI composer shows loading and appends a result', () => {
  vi.useFakeTimers()
  render(<EditorProvider><AppShell /></EditorProvider>)
  fireEvent.click(screen.getByRole('button', { name: '执行 AI 操作' }))
  expect(screen.getByRole('button', { name: '执行中…' })).toBeDisabled()
  act(() => {
    vi.advanceTimersByTime(900)
  })
  expect(screen.getByRole('button', { name: '执行 AI 操作' })).toBeEnabled()
  expect(screen.getByRole('button', { name: '修改当前图 · 1' })).toBeInTheDocument()
})

test('selecting a history thumbnail makes it active', () => {
  render(<EditorProvider><AppShell /></EditorProvider>)
  const result = screen.getByRole('button', { name: '文生图 · 1' })
  fireEvent.click(result)
  expect(result).toHaveClass('active')
})


test('keeps the submitted scope and intent when the user changes them during execution', () => {
  vi.useFakeTimers()
  let latest: EditorState
  function Observer() { latest = useEditor().state; return null }
  render(<EditorProvider><AppShell /><Observer /></EditorProvider>)
  fireEvent.click(screen.getByRole('button', { name: '执行 AI 操作' }))
  fireEvent.click(screen.getByRole('button', { name: '切换到生成新内容' }))
  fireEvent.keyDown(window, { key: 'Escape' })
  act(() => vi.advanceTimersByTime(900))
  const result = latest!.layers[0]
  expect(result.aiOperation?.mode).toBe('edit')
  expect(result.aiOperation?.selection).toEqual(initialEditorState.selection)
  expect(latest!.selectionVisible).toBe(false)
  expect(screen.getByRole('button', { name: '修改当前图 · 1图层' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: '原图图层' })).toBeInTheDocument()
})

for (const count of [3, 6, 8]) {
  test(`selects ${count} results and adds the matching number of layers and history entries`, () => {
    vi.useFakeTimers()
    let latest: EditorState
    function Observer() { latest = useEditor().state; return null }
    render(<EditorProvider><AppShell /><Observer /></EditorProvider>)
    fireEvent.click(screen.getByRole('button', { name: '选择数量' }))
    for (const option of [1, 2, 3, 4, 6, 8]) expect(screen.getByRole('button', { name: `${option} 张` })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `${count} 张` }))
    expect(screen.getByRole('button', { name: '选择数量' })).toHaveTextContent(`${count} 张`)
    fireEvent.click(screen.getByRole('button', { name: '执行 AI 操作' }))
    act(() => vi.advanceTimersByTime(900))
    expect(latest!.layers).toHaveLength(initialEditorState.layers.length + count)
    expect(latest!.history).toHaveLength(initialEditorState.history.length + count)
  })
}
