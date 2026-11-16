import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { AppShell } from '../app/AppShell'
import { EditorProvider } from '../state/editor'
import * as raster from './rasterTools'

function selectTool(group: string, tool: string | RegExp) {
  fireEvent.click(screen.getByRole('button', { name: `打开工具组菜单：${group}` }))
  fireEvent.click(screen.getByRole('menuitem', { name: tool }))
}

test('canvas tools perform visible actions on the canvas', async () => {
  vi.spyOn(raster, 'sampleCanvasColor').mockResolvedValue('#dd806d')
  const view = render(<EditorProvider><AppShell /></EditorProvider>)
  const interaction = screen.getByLabelText('画布交互层')
  selectTool('画笔', '画笔 (B)')
  fireEvent.pointerDown(interaction, { pointerId: 1, clientX: 120, clientY: 160, buttons: 1 })
  fireEvent.pointerUp(interaction, { pointerId: 1, clientX: 120, clientY: 160 })
  expect(view.container.querySelectorAll('.canvas-art > .scene-layer .brush-stroke:not(mask .brush-stroke)')).toHaveLength(1)
  selectTool('擦除/修复', '橡皮 (E)')
  fireEvent.pointerDown(interaction, { pointerId: 2, clientX: 120, clientY: 160, buttons: 1 })
  fireEvent.pointerUp(interaction, { pointerId: 2, clientX: 120, clientY: 160 })
  expect(view.container.querySelector('mask[data-eraser]')).toBeInTheDocument()
  selectTool('文字/形状', /文字/)
  fireEvent.pointerDown(interaction, { pointerId: 3, clientX: 220, clientY: 240, buttons: 1 })
  fireEvent.pointerUp(interaction, { pointerId: 3, clientX: 220, clientY: 240 })
  expect(view.container.querySelector('.canvas-text')).toBeInTheDocument()
  selectTool('颜色/填充', /取色/)
  fireEvent.pointerDown(interaction, { pointerId: 4, clientX: 220, clientY: 240, buttons: 1 })
  expect(await screen.findByText('已取色 #dd806d')).toBeInTheDocument()
})

test('selection tool creates a rectangle from a drag gesture', () => {
  const view = render(<EditorProvider><AppShell /></EditorProvider>)
  const interaction = screen.getByLabelText('画布交互层')
  vi.spyOn(interaction, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 500, height: 625, right: 500, bottom: 625, x: 0, y: 0, toJSON: () => ({}) })
  vi.spyOn(view.container.querySelector('.artboard')!, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 500, height: 625, right: 500, bottom: 625, x: 0, y: 0, toJSON: () => ({}) })
  selectTool('选区', '选区')
  fireEvent.pointerDown(interaction, { pointerId: 5, clientX: 100, clientY: 100, buttons: 1 })
  fireEvent.pointerMove(interaction, { pointerId: 5, clientX: 350, clientY: 400, buttons: 1 })
  fireEvent.pointerUp(interaction, { pointerId: 5, clientX: 350, clientY: 400 })
  const overlay = screen.getByLabelText('局部选区')
  expect(overlay).toHaveStyle({ left: '20%', top: '16%', width: '50%', height: '48%' })
})

test('selection handles resize an existing rectangle', () => {
  const view = render(<EditorProvider><AppShell /></EditorProvider>)
  const artboard = view.container.querySelector('.artboard')!
  vi.spyOn(artboard, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 500, height: 625, right: 500, bottom: 625, x: 0, y: 0, toJSON: () => ({}) })
  selectTool('选区', '选区')
  const handle = screen.getByRole('button', { name: '调整选区nw' })
  fireEvent.pointerDown(handle, { pointerId: 6, clientX: 135, clientY: 162, buttons: 1 })
  fireEvent.pointerMove(handle, { pointerId: 6, clientX: 100, clientY: 120, buttons: 1 })
  fireEvent.pointerUp(handle, { pointerId: 6, clientX: 100, clientY: 120 })
  expect(screen.getByLabelText('局部选区')).toHaveStyle({ left: '20%', width: '53%' })
})

test('history strip collapses and restores its results area', () => {
  render(<EditorProvider><AppShell /></EditorProvider>)
  fireEvent.click(screen.getByRole('button', { name: '折叠历史' }))
  expect(screen.queryByRole('button', { name: '初始文档' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '展开历史' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '展开历史' }))
  expect(screen.getByRole('button', { name: '初始文档' })).toBeInTheDocument()
})
