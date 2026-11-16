import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { TextObject, type CanvasTextObject } from './TextObject'

const object: CanvasTextObject = { id: 'text', layerId: 'art', x: 20, y: 30, text: '原标题', fontFamily: 'serif', fontSize: 30, fontWeight: '700', color: '#ffffff', align: 'left' }

test('double-click edits text and blur commits it once', () => {
  const commit = vi.fn()
  render(<TextObject object={object} onCommit={commit} selected />)
  fireEvent.doubleClick(screen.getByText('原标题'))
  const input = screen.getByRole('textbox', { name: '编辑画布文字' })
  fireEvent.change(input, { target: { value: '新标题' } })
  fireEvent.blur(input)
  expect(commit).toHaveBeenCalledExactlyOnceWith({ ...object, text: '新标题' })
})

test('Escape cancels a text edit without committing', () => {
  const commit = vi.fn()
  render(<TextObject object={object} onCommit={commit} selected />)
  fireEvent.doubleClick(screen.getByText('原标题'))
  const input = screen.getByRole('textbox', { name: '编辑画布文字' })
  fireEvent.change(input, { target: { value: '放弃' } })
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(screen.getByText('原标题')).toBeInTheDocument()
  expect(commit).not.toHaveBeenCalled()
})

test('double-clicking inside the editor preserves the uncommitted draft', () => {
  const commit = vi.fn()
  render(<TextObject object={object} onCommit={commit} selected />)
  fireEvent.doubleClick(screen.getByText('原标题'))
  const input = screen.getByRole('textbox', { name: '编辑画布文字' })
  fireEvent.change(input, { target: { value: '未提交的新标题' } })
  fireEvent.doubleClick(input)
  expect(input).toHaveValue('未提交的新标题')
  fireEvent.blur(input)
  expect(commit).toHaveBeenCalledExactlyOnceWith({ ...object, text: '未提交的新标题' })
})

test('text tool can start editing an existing text object with one click', () => {
  render(<TextObject object={object} onCommit={vi.fn()} selected editOnClick />)
  fireEvent.click(screen.getByText('原标题'))
  const input = screen.getByRole('textbox', { name: '编辑画布文字' }) as HTMLTextAreaElement
  expect(input).toHaveValue('原标题')
  expect(input.selectionStart).toBe(input.value.length)
  expect(input.selectionEnd).toBe(input.value.length)
})

test('keeps the editor on the canvas with transparent styling instead of a second visible text copy', () => {
  render(<TextObject object={object} onCommit={vi.fn()} selected />)
  fireEvent.doubleClick(screen.getByText('原标题'))
  const input = screen.getByRole('textbox', { name: '编辑画布文字' })
  expect(input).toHaveClass('canvas-text-editor')
  expect(screen.getByText('原标题', { selector: '.canvas-text-edit-preview' })).toHaveAttribute('aria-hidden', 'true')
})

test('paragraph text keeps Enter for a new line and uses Command or Control Enter to commit', () => {
  const commit = vi.fn()
  render(<TextObject object={{ ...object, layout: 'paragraph', width: 220, height: 80 }} onCommit={commit} selected />)
  fireEvent.doubleClick(screen.getByText('原标题'))
  const input = screen.getByRole('textbox', { name: '编辑画布文字' })
  fireEvent.change(input, { target: { value: '第一行\n第二行' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(commit).not.toHaveBeenCalled()
  fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
  expect(commit).toHaveBeenCalledExactlyOnceWith({ ...object, layout: 'paragraph', width: 220, height: 80, text: '第一行\n第二行' })
})

test('small point text scales from its measured visible box rather than saved placeholder dimensions', () => {
  const preview = vi.fn(), commit = vi.fn()
  render(<TextObject object={{ ...object, text: '文字', fontSize: 12, width: 192, height: 36 }} onPreview={preview} onCommit={commit} selected toPoint={(x, y) => ({ x: x / 5, y: y / 6.25 })} />)
  const root = document.querySelector('.canvas-text-object')!
  Object.defineProperties(root, { offsetWidth: { value: 24 }, offsetHeight: { value: 16.8 } })
  const handle = screen.getByRole('button', { name: '缩放文字右下角' })
  fireEvent.pointerDown(handle, { pointerId: 5, clientX: 100, clientY: 100, button: 0 })
  fireEvent.pointerMove(handle, { pointerId: 5, clientX: 112, clientY: 100, buttons: 1 })
  expect(preview.mock.lastCall?.[0].fontSize).toBeCloseTo(18)
  expect(commit).not.toHaveBeenCalled()
  fireEvent.pointerUp(handle, { pointerId: 5, clientX: 112, clientY: 100, button: 0 })
  expect(commit).toHaveBeenCalledOnce()
  expect(commit.mock.lastCall?.[0].fontSize).toBeCloseTo(18)
})

test('paragraph control bounds follow the same wrapped lines as the scene', () => {
  render(<TextObject object={{ ...object, text: '双击编辑文字', layout: 'paragraph', fontSize: 12, width: 24, height: 20 }} onCommit={vi.fn()} selected />)
  expect(document.querySelector('.canvas-text')?.textContent).toBe('双击\n编辑\n文字')
})

test('a transform handle click does not enter text editing', () => {
  render(<TextObject object={object} onCommit={vi.fn()} selected editOnClick toPoint={(x, y) => ({ x, y })} />)
  const handle = screen.getByRole('button', { name: '缩放文字右下角' })
  fireEvent.pointerDown(handle, { pointerId: 7, clientX: 10, clientY: 10, button: 0 })
  fireEvent.pointerUp(handle, { pointerId: 7, clientX: 10, clientY: 10, button: 0 })
  fireEvent.click(handle)
  expect(screen.queryByRole('textbox', { name: '编辑画布文字' })).toBeNull()
})
