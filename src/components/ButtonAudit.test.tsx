import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { AppShell } from '../app/AppShell'
import { EditorProvider } from '../state/editor'

function renderShell() { return render(<EditorProvider><AppShell /></EditorProvider>) }

test('top actions support undo, redo, export and account settings', () => {
  renderShell()
  const prompt = screen.getByRole('textbox', { name: 'AI 操作' })
  const canvas = screen.getByRole('region', { name: '主画布' })
  expect(within(canvas).getByRole('button', { name: '撤销' })).toBeInTheDocument()
  expect(screen.getByRole('banner')).not.toContainElement(screen.getByRole('button', { name: '撤销' }))
  fireEvent.change(prompt, { target: { value: '新的描述' } })
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(prompt).toHaveValue('一张春日黄昏海报，暖色天空，远山和树影，安静、留白、杂志感')
  fireEvent.click(screen.getByRole('button', { name: '重做' }))
  expect(prompt).toHaveValue('新的描述')
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  fireEvent.click(screen.getByRole('button', { name: '导出' }))
  expect(screen.getByRole('dialog', { name: '导出图像' })).toBeInTheDocument()
  expect(screen.queryByText('画布已导出为 SVG')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(screen.queryByRole('dialog', { name: '导出图像' })).not.toBeInTheDocument()
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '账户设置' }))
  fireEvent.click(screen.getByRole('button', { name: '服务来源' }))
  expect(screen.getByRole('dialog', { name: '服务来源管理' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '添加来源' }))
  expect(screen.getByLabelText('密钥')).toHaveAttribute('type', 'password')
})

test('history tabs, clear and import buttons update the history area', async () => {
  renderShell()
  fireEvent.click(screen.getByRole('button', { name: '生成结果' }))
  expect(screen.getByRole('button', { name: '文生图 · 1' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '原图 · 现在' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '清空' }))
  expect(screen.getByText('暂无生成结果')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '导入图片' }))
  const fileInput = screen.getByLabelText('选择要导入的图片')
  class MockImage { onload?: () => void; onerror?: () => void; set src(_value: string) { queueMicrotask(() => this.onload?.()) } }
  vi.stubGlobal('Image', MockImage)
  const onePixelPng = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), (character) => character.charCodeAt(0))
  fireEvent.change(fileInput, { target: { files: [new File([onePixelPng], 'reference.png', { type: 'image/png' })] } })
  await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('已导入 reference.png'))
})

test('layer controls add, select, hide and edit layer properties', () => {
  renderShell()
  fireEvent.click(screen.getByRole('button', { name: '新建图层' }))
  const newLayer = screen.getByRole('button', { name: /新图层 4图层/ })
  expect(newLayer).toHaveAttribute('aria-pressed', 'true')
  const visibilityButton = screen.getByRole('button', { name: '新图层 4隐藏' })
  expect(visibilityButton.querySelector('svg')).toBeInTheDocument()
  const lockButton = screen.getByRole('button', { name: '新图层 4锁定' })
  expect(lockButton.querySelector('svg')).toBeInTheDocument()
  fireEvent.click(visibilityButton)
  expect(screen.getByRole('button', { name: '新图层 4显示' })).toBeInTheDocument()
  fireEvent.change(screen.getByRole('spinbutton', { name: '图层不透明度' }), { target: { value: '65' } })
  expect(screen.getByRole('spinbutton', { name: '图层不透明度' })).toHaveValue(65)
  fireEvent.change(screen.getByRole('combobox', { name: '图层混合模式' }), { target: { value: '正片叠底' } })
  expect(screen.getByRole('combobox', { name: '图层混合模式' })).toHaveValue('正片叠底')
})

test('canvas zoom buttons and pinch gesture work while Escape cancels the selection', () => {
  renderShell()
  const canvas = screen.getByRole('region', { name: '主画布' })
  fireEvent.touchStart(canvas, { touches: [{ clientX: 0, clientY: 0 }, { clientX: 100, clientY: 0 }] })
  fireEvent.touchMove(canvas, { touches: [{ clientX: 0, clientY: 0 }, { clientX: 160, clientY: 0 }] })
  expect(canvas).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '放大' }))
  expect(screen.getByText('170%')).toBeInTheDocument()
  expect(screen.getByLabelText('局部选区')).toBeInTheDocument()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByLabelText('局部选区')).not.toBeInTheDocument()
})
