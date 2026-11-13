import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { AppShell } from '../app/AppShell'
import { EditorProvider } from '../state/editor'

function renderShell() {
  return render(<EditorProvider><AppShell /></EditorProvider>)
}

function activeTool() {
  return document.querySelector('.artboard')?.getAttribute('data-active-tool')
}

test('switches to each documented tool shortcut', () => {
  renderShell()

  const shortcuts = [
    ['V', 'select'],
    ['M', 'rectangle-select'],
    ['L', 'lasso-select'],
    ['P', 'pen'],
    ['B', 'brush'],
    ['E', 'eraser'],
    ['Q', 'mask'],
    ['C', 'crop'],
    ['T', 'text'],
    ['I', 'picker'],
    ['H', 'pan'],
    ['Z', 'zoom'],
    ['R', 'rotate'],
  ] as const

  for (const [key, tool] of shortcuts) {
    fireEvent.keyDown(window, { key })
    expect(activeTool()).toBe(tool)
  }
})

test('repeating a shortcut cycles its group and Shift also cycles it', () => {
  renderShell()

  fireEvent.keyDown(window, { key: 'm' })
  expect(activeTool()).toBe('rectangle-select')
  fireEvent.keyDown(window, { key: 'm' })
  expect(activeTool()).toBe('ellipse-select')
  fireEvent.keyDown(window, { key: 'm', shiftKey: true })
  expect(activeTool()).toBe('lasso-select')
})

test('Space temporarily activates pan and restores the previous tool', () => {
  renderShell()

  fireEvent.keyDown(window, { key: 'b' })
  fireEvent.keyDown(window, { key: ' ' })
  expect(activeTool()).toBe('pan')
  fireEvent.keyUp(window, { key: ' ' })
  expect(activeTool()).toBe('brush')
})

test('ignores tool shortcuts while editing text or account fields', () => {
  renderShell()

  const composer = screen.getByRole('textbox', { name: 'AI 操作' })
  composer.focus()
  fireEvent.keyDown(composer, { key: 'b' })
  expect(activeTool()).toBe('select')

  const select = document.createElement('select')
  document.body.append(select)
  select.focus()
  fireEvent.keyDown(select, { key: 'b' })
  expect(activeTool()).toBe('select')
  select.remove()

  const editable = document.createElement('div')
  editable.contentEditable = 'true'
  document.body.append(editable)
  editable.focus()
  fireEvent.keyDown(editable, { key: 'b' })
  expect(activeTool()).toBe('select')
  editable.remove()

  fireEvent.click(screen.getByRole('button', { name: '账户设置' }))
  fireEvent.click(screen.getByRole('button', { name: 'API Key' }))
  const accountInput = screen.getByRole('textbox', { name: 'API Key 输入框' })
  accountInput.focus()
  fireEvent.keyDown(accountInput, { key: 'b' })
  expect(activeTool()).toBe('select')
})

test('maps command shortcuts to undo, redo, and canvas zoom', () => {
  renderShell()

  const prompt = screen.getByRole('textbox', { name: 'AI 操作' })
  fireEvent.change(prompt, { target: { value: 'changed' } })
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
  expect(prompt).toHaveValue('一张春日黄昏海报，暖色天空，远山和树影，安静、留白、杂志感')
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
  expect(prompt).toHaveValue('changed')

  fireEvent.keyDown(window, { key: '+', ctrlKey: true })
  expect(screen.getByText('110%')).toBeInTheDocument()
  fireEvent.keyDown(window, { key: '-', ctrlKey: true })
  expect(screen.getByText('100%')).toBeInTheDocument()
  fireEvent.keyDown(window, { key: '1', ctrlKey: true })
  expect(screen.getByText('100%')).toBeInTheDocument()
  fireEvent.keyDown(window, { key: '0', ctrlKey: true })
  expect(screen.getByText('100%')).toBeInTheDocument()
})
