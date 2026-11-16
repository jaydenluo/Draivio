import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { AppShell } from '../app/AppShell'
import { EditorProvider } from '../state/editor'
import { loadConnections } from './serviceConnections'

test('moves the same composer between the canvas and the sidebar without losing work', async () => {
  localStorage.setItem('draivio-service-connections-v1', JSON.stringify([{ id: 'layout-source', provider: 'OpenAI', name: '布局测试来源', baseUrl: 'https://layout.example/v1', apiKey: 'test-key', protocol: 'openai_compatible', models: ['layout-model'], enabled: true }]))
  await loadConnections()
  render(<EditorProvider><AppShell /></EditorProvider>)
  const input = screen.getByRole('textbox', { name: 'AI 操作' })
  fireEvent.change(input, { target: { value: '把天空改成蓝色' } })
  fireEvent.click(screen.getByRole('button', { name: '选择模型' }))
  fireEvent.click(screen.getByRole('button', { name: 'layout-model · OpenAI · 布局测试来源' }))
  fireEvent.click(screen.getByRole('button', { name: '切换到生成新内容' }))

  fireEvent.click(screen.getByRole('button', { name: '移到右侧' }))
  expect(screen.getByRole('region', { name: 'AI 操作' })).toHaveAttribute('data-placement', 'right')
  expect(input).toHaveValue('把天空改成蓝色')
  expect(screen.getByRole('button', { name: '选择模型' })).toHaveTextContent('layout-model')
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
    expect(screen.getByRole('textbox', { name: 'AI 操作' })).toHaveValue('保留这条修改描述')
    expect(screen.getByRole('button', { name: '执行 AI 操作' })).toBeInTheDocument()
    const composer = screen.getByRole('region', { name: 'AI 操作' })
    expect(composer).toHaveAttribute('data-placement', placement)
    expect(within(composer).queryByRole('button', { name: '选择数量' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'AI 操作' }), { target: { value: '收起后继续修改' } })
    fireEvent.focus(screen.getByRole('textbox', { name: 'AI 操作' }))
    expect(screen.getByRole('textbox', { name: 'AI 操作' })).toHaveValue('收起后继续修改')
    fireEvent.change(screen.getByRole('textbox', { name: 'AI 操作' }), { target: { value: '保留这条修改描述' } })
    expect(screen.getByRole('button', { name: '选择数量' })).toHaveTextContent('2 张')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  }
})

test('hides the top row when minimized and expands when the prompt receives focus', () => {
  render(<EditorProvider><AppShell /></EditorProvider>)
  fireEvent.click(screen.getByRole('button', { name: '最小化 AI 对话框' }))
  expect(screen.queryByRole('button', { name: '切换到生成新内容' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '查看模型与参数指南' })).not.toBeInTheDocument()
  fireEvent.focus(screen.getByRole('textbox', { name: 'AI 操作' }))
  expect(screen.getByRole('button', { name: '切换到生成新内容' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '最小化 AI 对话框' })).toBeInTheDocument()
})
