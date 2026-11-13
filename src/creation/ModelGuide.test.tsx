import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { AppShell } from '../app/AppShell'
import { EditorProvider } from '../state/editor'

function setup() { render(<EditorProvider><AppShell /></EditorProvider>) }

test('opens a sourced model guide and explains that strength is not universal', () => {
  setup()
  fireEvent.click(screen.getByRole('button', { name: '查看模型与参数指南' }))
  const guide = screen.getByRole('dialog', { name: '图片模型与参数指南' })
  expect(within(guide).getByText('Seedream 5.5 / 5.0')).toBeInTheDocument()
  expect(within(guide).getByRole('link', { name: /火山方舟图片生成 API/ })).toHaveAttribute('href', 'https://docs.volcengine.com/docs/ark/image-generation-api?lang=zh')
  fireEvent.click(within(guide).getByRole('tab', { name: '强度与参数' }))
  expect(within(guide).getByRole('heading', { name: '强度不是所有模型的通用参数' })).toBeInTheDocument()
  expect(within(guide).getByText(/48%.*演示/)).toBeInTheDocument()
  expect(within(guide).getByText(/CFG.*不是/)).toBeInTheDocument()
})

test('Escape closes only the guide, restores focus and preserves the prompt and selection', () => {
  setup()
  const input = screen.getByRole('textbox', { name: 'AI 操作' })
  fireEvent.change(input, { target: { value: '保留我的描述' } })
  const trigger = screen.getByRole('button', { name: '查看模型与参数指南' })
  trigger.focus()
  fireEvent.click(trigger)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: '图片模型与参数指南' })).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
  expect(input).toHaveValue('保留我的描述')
  expect(screen.getByLabelText('局部选区')).toBeInTheDocument()
})

test('opens from the docked composer and separates verified sources from unverified candidates', () => {
  setup()
  fireEvent.click(screen.getByRole('button', { name: '移到右侧' }))
  fireEvent.click(screen.getByRole('button', { name: '查看模型与参数指南' }))
  const guide = screen.getByRole('dialog', { name: '图片模型与参数指南' })
  expect(within(guide).getByText(/2026-11-13/)).toBeInTheDocument()
  expect(within(guide).getByText(/当前版本与参数待核实/)).toBeInTheDocument()
  fireEvent.click(within(guide).getByRole('tab', { name: '使用建议' }))
  expect(within(guide).getByText(/8 张.*单次请求/)).toBeInTheDocument()
  fireEvent.click(within(guide).getByRole('button', { name: '关闭模型指南' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('keeps keyboard focus within the guide and supports tab navigation without changing canvas tools', () => {
  setup()
  fireEvent.click(screen.getByRole('button', { name: '查看模型与参数指南' }))
  const guide = screen.getByRole('dialog', { name: '图片模型与参数指南' })
  const close = within(guide).getByRole('button', { name: '关闭模型指南' })
  expect(close).toHaveFocus()
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
  expect(within(guide).getAllByRole('link').at(-1)).toHaveFocus()
  fireEvent.keyDown(document.activeElement!, { key: 'Tab' })
  expect(close).toHaveFocus()
  const models = within(guide).getByRole('tab', { name: '模型怎么选' })
  models.focus()
  fireEvent.keyDown(models, { key: 'ArrowRight' })
  expect(within(guide).getByRole('tab', { name: '强度与参数' })).toHaveFocus()
  fireEvent.keyDown(within(guide).getByRole('tab', { name: '强度与参数' }), { key: 'b' })
  fireEvent.click(close)
  expect(screen.getByRole('button', { name: '工具组：选择/移动' })).toHaveAttribute('aria-pressed', 'true')
})
