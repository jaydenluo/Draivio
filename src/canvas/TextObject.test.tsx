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
