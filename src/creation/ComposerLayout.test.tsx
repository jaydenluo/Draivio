import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { AppShell } from '../app/AppShell'
import { EditorProvider } from '../state/editor'

test('moves the same composer between the canvas and the sidebar without losing work', () => {
  render(<EditorProvider><AppShell /></EditorProvider>)
  const input = screen.getByRole('textbox', { name: 'AI 操作' })
  fireEvent.change(input, { target: { value: '把天空改成蓝色' } })
  fireEvent.click(screen.getByRole('button', { name: '选择模型' }))
  fireEvent.click(screen.getByRole('button', { name: 'Image Fast' }))
  fireEvent.click(screen.getByRole('button', { name: '切换到生成新内容' }))

  fireEvent.click(screen.getByRole('button', { name: '移到右侧' }))
  expect(screen.getByRole('region', { name: 'AI 操作' })).toHaveAttribute('data-placement', 'right')
  expect(input).toHaveValue('把天空改成蓝色')
  expect(screen.getByRole('button', { name: '选择模型' })).toHaveTextContent('Image Fast')
  expect(screen.getByRole('button', { name: '切换到修改当前图' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '图层' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '悬浮到画布底部' }))
  expect(screen.getByRole('region', { name: 'AI 操作' })).toHaveAttribute('data-placement', 'floating')
  expect(input).toHaveValue('把天空改成蓝色')
})

test('minimizes and restores the composer in either placement while preserving its draft', () => {
  render(<EditorProvider><AppShell /></EditorProvider>)
  fireEvent.change(screen.getByRole('textbox', { name: 'AI 操作' }), { target: { value: '保留这条修改描述' } })
  fireEvent.click(screen.getByRole('button', { name: '选择数量' }))
  fireEvent.click(screen.getByRole('button', { name: '2 张' }))

  for (const placement of ['floating', 'right']) {
    if (placement === 'right') fireEvent.click(screen.getByRole('button', { name: '移到右侧' }))
    fireEvent.click(screen.getByRole('button', { name: '最小化 AI 对话框' }))
    expect(screen.queryByRole('textbox', { name: 'AI 操作' })).not.toBeInTheDocument()
    const composer = screen.getByRole('region', { name: 'AI 操作' })
    expect(composer).toHaveAttribute('data-placement', placement)
    expect(within(composer).queryByRole('button', { name: '选择数量' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '展开 AI 对话框' }))
    expect(screen.getByRole('textbox', { name: 'AI 操作' })).toHaveValue('保留这条修改描述')
    expect(screen.getByRole('button', { name: '选择数量' })).toHaveTextContent('2 张')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  }
})
