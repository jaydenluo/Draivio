import { act, createEvent, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { AIComposer } from './AIComposer'
import { EditorProvider } from '../state/editor'
import * as composerImages from './composerImage'

function mount() {
  render(<EditorProvider><AIComposer /></EditorProvider>)
}

test('offers three clear creation modes with one shared prompt surface', () => {
  mount()
  expect(screen.getByRole('button', { name: '生成图片' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '修改图片' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '编辑画布' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '编辑画布' }))
  expect(screen.getByPlaceholderText('输入你的要求')).toBeInTheDocument()
  expect(screen.queryByText('输入一句话开始编辑')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('AI 自动识别')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', {name:'更多 AI 设置'})).not.toBeInTheDocument()
  expect(screen.queryByRole('combobox', { name: '智能操作作用对象' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '添加图片' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '选择推理模型' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '选择比例与分辨率' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '选择数量' })).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '生成图片' }))
  expect(screen.getByRole('button', { name: '添加图片' })).toBeInTheDocument()
  expect(screen.queryByRole('combobox', { name: '智能操作作用对象' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '修改图片' }))
  expect(screen.getByRole('button', { name: '添加图片' })).toBeInTheDocument()
})

test('accepts a pasted image and shows a removable attachment', async () => {
  mount()
  const input = screen.getByRole('textbox', { name: 'AI 操作' })
  const file = new File(['png'], 'pasted.png', { type: 'image/png' })
  fireEvent.paste(input, { clipboardData: { files: [file], items: [] } })
  expect(await screen.findByAltText('已添加图片 pasted.png')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '移除图片' }))
  expect(screen.queryByAltText('已添加图片 pasted.png')).not.toBeInTheDocument()
})

test('preserves attachments across modes, minimizing and docking', async () => {
  mount()
  fireEvent.change(screen.getByLabelText('选择图片'), { target: { files: [new File(['png'], 'reference.png', { type: 'image/png' })] } })
  await screen.findByAltText('已添加图片 reference.png')
  for (const mode of ['生成图片', '修改图片', '编辑画布']) {
    fireEvent.click(screen.getByRole('button', { name: mode }))
    expect(screen.getByAltText('已添加图片 reference.png')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加图片' })).toBeEnabled()
  }
  fireEvent.click(screen.getByRole('button', { name: '移到右侧' }))
  fireEvent.click(screen.getByRole('button', { name: '最小化 AI 对话框' }))
  expect(screen.getByRole('button', { name: '添加图片' })).toBeEnabled()
  expect(screen.getByAltText('已添加图片 reference.png')).toBeInTheDocument()
  fireEvent.focus(screen.getByRole('textbox', { name: 'AI 操作' }))
  expect(screen.getByAltText('已添加图片 reference.png')).toBeInTheDocument()
})

test('does not intercept text paste or discard an attachment when file selection is canceled', async () => {
  mount()
  const input = screen.getByRole('textbox', { name: 'AI 操作' })
  const paste = createEvent.paste(input, { clipboardData: { files: [], items: [], getData: () => '粘贴文字' } })
  fireEvent(input, paste)
  expect(paste.defaultPrevented).toBe(false)
  fireEvent.change(screen.getByLabelText('选择图片'), { target: { files: [new File(['png'], 'keep.png', { type: 'image/png' })] } })
  await screen.findByAltText('已添加图片 keep.png')
  fireEvent.change(screen.getByLabelText('选择图片'), { target: { files: [] } })
  expect(screen.getByAltText('已添加图片 keep.png')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('选择图片'), { target: { files: [new File(['bad'], 'bad.gif', { type: 'image/gif' })] } })
  expect(await screen.findByRole('alert')).toHaveTextContent('请选择 PNG、JPEG 或 WebP 图片')
  expect(screen.getByAltText('已添加图片 keep.png')).toBeInTheDocument()
})

test('keeps only the latest asynchronous image read and blocks sending until it finishes', async () => {
  const reads: Array<(image: composerImages.ComposerImage) => void> = []
  const read = vi.spyOn(composerImages, 'readComposerImage').mockImplementation(() => new Promise(resolve => reads.push(resolve)))
  try {
    mount()
    fireEvent.click(screen.getByRole('button', {name:'编辑画布'}))
    const fileInput = screen.getByLabelText('选择图片')
    for (const name of ['old.png', 'new.png']) fireEvent.change(fileInput, {target:{files:[new File(['png'], name, {type:'image/png'})]}})
    expect(screen.getByRole('button', {name:'执行 AI 操作'})).toBeDisabled()
    await act(async () => reads[1]({source:'data:image/png;base64,bmV3', name:'new.png'}))
    await act(async () => reads[0]({source:'data:image/png;base64,b2xk', name:'old.png'}))
    expect(screen.getByAltText('已添加图片 new.png')).toBeInTheDocument()
    expect(screen.queryByAltText('已添加图片 old.png')).not.toBeInTheDocument()
  } finally { read.mockRestore() }
})

test('uses Enter to submit smart operations and Shift+Enter for a newline', () => {
  mount()
  fireEvent.click(screen.getByRole('button', { name: '编辑画布' }))
  const input = screen.getByRole('textbox', { name: 'AI 操作' })
  fireEvent.change(input, { target: { value: '把标题移到左上角' } })
  fireEvent.keyDown(input, { key: 'Shift', shiftKey: true })
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
  expect(input).toHaveValue('把标题移到左上角')
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(screen.getByRole('region', { name: '编辑计划预览' })).toBeInTheDocument()
})

test('removing an attachment cancels a pending replacement without leaving sending disabled', async () => {
  const reads: Array<(image: composerImages.ComposerImage) => void> = []
  const read = vi.spyOn(composerImages, 'readComposerImage').mockImplementation(() => new Promise(resolve => reads.push(resolve)))
  try {
    mount()
    fireEvent.click(screen.getByRole('button', {name:'编辑画布'}))
    const input = screen.getByLabelText('选择图片')
    fireEvent.change(input, {target:{files:[new File(['png'], 'first.png', {type:'image/png'})]}})
    await act(async () => reads[0]({source:'data:image/png;base64,Zmlyc3Q=', name:'first.png'}))
    fireEvent.change(input, {target:{files:[new File(['png'], 'second.png', {type:'image/png'})]}})
    expect(screen.getByRole('button', {name:'执行 AI 操作'})).toBeDisabled()
    fireEvent.click(screen.getByRole('button', {name:'移除图片'}))
    expect(screen.getByRole('button', {name:'执行 AI 操作'})).toBeEnabled()
    await act(async () => reads[1]({source:'data:image/png;base64,c2Vjb25k', name:'second.png'}))
    expect(screen.queryByAltText('已添加图片 second.png')).not.toBeInTheDocument()
  } finally { read.mockRestore() }
})


test('places auto understanding beside the three existing modes with the same exclusive selection behavior', () => {
  mount()
  const modes = screen.getByRole('tablist', { name: 'AI 快捷操作' })
  const automatic = screen.getByRole('button', { name: '自动理解' })
  expect(automatic.parentElement).toBe(modes)
  expect(screen.queryByRole('checkbox', { name: '自动理解意图（试用）' })).not.toBeInTheDocument()
  fireEvent.click(automatic)
  expect(automatic).toHaveAttribute('aria-pressed', 'true')
  expect(automatic).toHaveClass('is-active')
  for (const name of ['生成图片', '修改图片', '编辑画布']) expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('button', { name: '选择推理模型' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '选择数量' })).toBeInTheDocument()
  fireEvent.click(automatic)
  expect(automatic).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: '生成图片' }))
  expect(automatic).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('button', { name: '生成图片' })).toHaveClass('is-active')
})

test('starts in automatic mode and names the manual canvas-edit entry explicitly', () => {
 render(<EditorProvider><AIComposer /></EditorProvider>)
 expect(screen.getByRole('button', {name:'自动理解'})).toHaveAttribute('aria-pressed', 'true')
 expect(screen.getByRole('button', {name:'编辑画布'})).toBeInTheDocument()
})
