import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { EditorProvider } from '../state/editor'
import { EnhancementPanel } from './EnhancementPanel'

test('shows focused cutout controls and model action', () => {
  render(<EditorProvider><EnhancementPanel kind="cutout" onRun={() => undefined} onManage={() => undefined} /></EditorProvider>)
  expect(screen.getByRole('region', { name: '扣图工具面板' })).toBeInTheDocument()
  expect(screen.getByText('透明背景')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '安装模型' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '开始扣图' })).toBeDisabled()
})

test('offers explicit 2x and 4x upscale choices', () => {
  render(<EditorProvider><EnhancementPanel kind="upscale" onRun={() => undefined} onManage={() => undefined} /></EditorProvider>)
  const scale = screen.getByRole('combobox', { name: '放大倍数' })
  expect(scale).toHaveValue('2')
  fireEvent.change(scale, { target: { value: '4' } })
  expect(scale).toHaveValue('4')
  expect(screen.getByRole('button', { name: '开始超分 4x' })).toBeEnabled()
  expect(screen.getByLabelText('本机增强服务')).toHaveValue('http://127.0.0.1:8767/restore')
})

test('moves the panel by dragging its title bar', () => {
  render(<EditorProvider><EnhancementPanel kind="cutout" onRun={() => undefined} onManage={() => undefined} /></EditorProvider>)
  const panel = screen.getByRole('region', { name: '扣图工具面板' })
  fireEvent.pointerDown(screen.getByText('扣图', { selector: 'strong' }), { clientX: 20, clientY: 80 })
  fireEvent.pointerMove(window, { clientX: 80, clientY: 120 })
  fireEvent.pointerUp(window)
  expect(panel.style.translate).toBe('60px 40px')
})
