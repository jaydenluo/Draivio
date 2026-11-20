import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { AppShell } from '../app/AppShell'
import { EditorProvider, useEditor } from '../state/editor'

function Probe() {
  const { state } = useEditor()
  return <output data-testid="selection-lifecycle">{JSON.stringify({ visible: state.selectionVisible, rect: state.selection.rect, undo: state.undoStack.length })}</output>
}
function setup() {
  render(<EditorProvider><AppShell /><Probe /></EditorProvider>)
  const board = document.querySelector('.artboard')!
  vi.spyOn(board, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 500, height: 625, right: 500, bottom: 625, x: 0, y: 0, toJSON: () => ({}) })
  return board
}
const current = () => JSON.parse(screen.getByTestId('selection-lifecycle').textContent!)
function selectRectangle(board: Element) {
  fireEvent.keyDown(window, { key: 'm' })
  fireEvent.pointerDown(board, { pointerId: 1, clientX: 100, clientY: 100, button: 0 })
  fireEvent.pointerMove(board, { pointerId: 1, clientX: 250, clientY: 300, buttons: 1 })
  fireEvent.pointerUp(board, { pointerId: 1, clientX: 250, clientY: 300, button: 0 })
}

test('starts without a fixed selection and switching to selection or mask tools never invents one', () => {
  setup()
  expect(screen.queryByLabelText('局部选区')).toBeNull()
  expect(current().visible).toBe(false)
  for (const key of ['m', 'q', 'b', 'm']) {
    fireEvent.keyDown(window, { key })
    expect(screen.queryByLabelText('局部选区')).toBeNull()
  }
})

test.each(['button', 'ctrl', 'meta', 'Escape'])('%s deselects and changing tools never resurrects the old region', method => {
  const board = setup()
  selectRectangle(board)
  expect(screen.getByLabelText('局部选区')).toBeInTheDocument()
  const before = current()
  if (method === 'button') fireEvent.click(screen.getByRole('button', { name: '取消选择' }))
  else fireEvent.keyDown(window, { key: method === 'Escape' ? 'Escape' : 'd', ctrlKey: method === 'ctrl', metaKey: method === 'meta' })
  expect(screen.queryByLabelText('局部选区')).toBeNull()
  for (const key of ['v', 'q', 'm']) {
    fireEvent.keyDown(window, { key })
    expect(screen.queryByLabelText('局部选区')).toBeNull()
  }
  expect(screen.getByRole('button', { name: '取消选择' })).toBeDisabled()
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
  expect(screen.getByLabelText('局部选区')).toBeInTheDocument()
  expect(current().rect).toEqual(before.rect)
})

test('keeps a user-drawn region active across tool changes and ignores deselect while typing', () => {
  const board = setup()
  selectRectangle(board)
  const before = current()
  for (const key of ['b', 'q', 'v']) {
    fireEvent.keyDown(window, { key })
    expect(screen.getByLabelText('局部选区')).toBeInTheDocument()
  }
  const input = screen.getByRole('textbox', { name: 'AI 操作' })
  input.focus()
  fireEvent.keyDown(input, { key: 'd', metaKey: true })
  expect(current()).toEqual(before)
})

test.each(['button', 'shortcut'])('%s cancels an in-progress replacement so pointer release cannot recreate it', method => {
  const board = setup()
  selectRectangle(board)
  fireEvent.pointerDown(board, { pointerId: 4, clientX: 300, clientY: 100, button: 0 })
  fireEvent.pointerMove(board, { pointerId: 4, clientX: 400, clientY: 200, buttons: 1 })
  if (method === 'button') fireEvent.click(screen.getByRole('button', { name: '取消选择' }))
  else fireEvent.keyDown(window, { key: 'd', ctrlKey: true })
  fireEvent.pointerUp(board, { pointerId: 4, clientX: 400, clientY: 200, button: 0 })
  expect(screen.queryByLabelText('局部选区')).toBeNull()
})
