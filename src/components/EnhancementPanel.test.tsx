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

test.each(['cutout', 'upscale'] as const)('moves %s by its title without dragging from controls', (kind) => {
  render(<EditorProvider><EnhancementPanel kind={kind} onRun={() => undefined} onManage={() => undefined} /></EditorProvider>)
  const panel = screen.getByRole('dialog', { name: `${kind === 'cutout' ? '扣图' : '超分'}窗口` })
  fireEvent.pointerDown(screen.getByText(kind === 'cutout' ? '扣图' : '超分', { selector: 'strong' }), { clientX: 20, clientY: 80 })
  fireEvent.pointerMove(window, { clientX: 80, clientY: 120 })
  fireEvent.pointerUp(window)
  expect(panel.style.translate).toBe('60px 40px')
  fireEvent.pointerDown(screen.getByRole('button', { name: kind === 'cutout' ? '安装模型' : '开始超分 2x' }), {button:0, pointerId:2, clientX:80, clientY:120})
  fireEvent.pointerMove(window, {pointerId:2, clientX:180, clientY:220})
  fireEvent.pointerUp(window, {pointerId:2})
  expect(panel.style.translate).toBe('60px 40px')
})

test.each(['cutout', 'upscale'] as const)('%s window escapes editor stacking and clipping', (kind) => {
  const view = render(<EditorProvider><div style={{position:'relative', zIndex:1, overflow:'hidden'}}><EnhancementPanel kind={kind} onRun={() => undefined} onManage={() => undefined} /></div></EditorProvider>)
  const panel = screen.getByRole('region', { name: `${kind === 'cutout' ? '扣图' : '超分'}工具面板` })
  expect(view.container).not.toContainElement(panel)
  expect(document.body).toContainElement(panel)
  expect(panel.closest('[role=dialog]')?.parentElement).toBe(document.body)
  expect(panel.closest('[role=dialog]')).toHaveStyle({position:'fixed'})
})
