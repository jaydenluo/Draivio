import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { AIComposer } from './AIComposer'
import { EditorProvider, useEditor } from '../state/editor'

function Controls() {
  const { dispatch } = useEditor()
  return <button onClick={() => dispatch({ type: 'set-selection-visible', visible: false })}>清除选区测试</button>
}

test('uses the current canvas context without exposing a scope selector', () => {
  render(<EditorProvider><AIComposer /><Controls /></EditorProvider>)
  fireEvent.click(screen.getByRole('button', { name: '编辑画布' }))
  expect(screen.queryByLabelText('AI 作用范围')).toBeNull()
  expect(screen.queryByText(/空提示移除/)).toBeNull()
  expect(screen.queryByLabelText('AI 自动识别')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '添加图片' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '查看编辑范围' })).toBeNull()
  fireEvent.click(screen.getByText('清除选区测试'))
  fireEvent.click(screen.getByRole('button', { name: '生成图片' }))
  expect(screen.queryByRole('button', { name: '查看编辑范围' })).toBeNull()
})

test('keeps send validation accessible and links scope guidance to model selection without submitting', () => {
  const fetcher = vi.spyOn(globalThis, 'fetch')
  try {
    render(<EditorProvider><AIComposer /></EditorProvider>)
    fireEvent.click(screen.getByRole('button', { name: '生成图片' }))
    const send = screen.getByRole('button', { name: '执行 AI 操作' })
    expect(send).toBeDisabled()
    expect(send).toHaveAccessibleDescription(/模型|登录/)
    fireEvent.click(screen.getByRole('button', { name: '选择模型' }))
    expect(screen.getByRole('dialog', { name: '选择模型' })).toBeInTheDocument()
    expect(fetcher).not.toHaveBeenCalled()
  } finally { fetcher.mockRestore() }
})
