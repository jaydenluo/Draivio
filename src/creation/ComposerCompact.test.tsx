import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { AIComposer } from './AIComposer'
import { EditorProvider, initialEditorState } from '../state/editor'

const start = vi.hoisted(() => vi.fn())
vi.mock('./ImageGeneration', async importOriginal => ({ ...await importOriginal<typeof import('./ImageGeneration')>(), useImageGeneration: () => ({ start }) }))

test('the collapsed input sends through the existing generation action', () => {
  render(<EditorProvider initialState={{ ...initialEditorState, composerMinimized: true }}><AIComposer /></EditorProvider>)
  fireEvent.change(screen.getByRole('textbox', { name: 'AI 操作' }), { target: { value: '收起时发送的内容' } })
  fireEvent.click(screen.getByRole('button', { name: '执行 AI 操作' }))
  expect(start).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('textbox', { name: 'AI 操作' })).toHaveValue('收起时发送的内容')
  expect(screen.queryByRole('button', { name: '选择模型' })).not.toBeInTheDocument()
})
test('the collapsed send action stays disabled during generation', () => {
  render(<EditorProvider initialState={{ ...initialEditorState, composerMinimized: true, isGenerating: true }}><AIComposer /></EditorProvider>)
  expect(screen.getByRole('button', { name: '执行中…' })).toBeDisabled()
})
