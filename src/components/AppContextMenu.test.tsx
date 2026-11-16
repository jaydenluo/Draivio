import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { AppContextMenu } from './AppContextMenu'

afterEach(() => {
  window.getSelection()?.removeAllRanges()
})

test('blocks the browser context menu everywhere without showing an app menu for ordinary clicks', () => {
  render(<AppContextMenu />)

  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 30 })
  document.body.dispatchEvent(event)

  expect(event.defaultPrevented).toBe(true)
  expect(screen.queryByRole('menu')).toBeNull()
})

test('shows a copy action when text is selected and copies it from the custom menu', async () => {
  const host = document.createElement('p')
  host.textContent = '可以复制的文字'
  document.body.append(host)
  const range = document.createRange()
  range.selectNodeContents(host)
  window.getSelection()?.removeAllRanges()
  window.getSelection()?.addRange(range)
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })

  render(<AppContextMenu />)
  fireEvent.contextMenu(host, { clientX: 160, clientY: 96 })

  expect(screen.getByRole('menuitem', { name: '复制' })).toBeInTheDocument()
  await fireEvent.click(screen.getByRole('menuitem', { name: '复制' }))
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('可以复制的文字'))
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  host.remove()
})

test('reads a selected range from an input when the browser selection is not available', () => {
  const input = document.createElement('input')
  input.value = '输入框里的文字'
  document.body.append(input)
  render(<AppContextMenu />)
  input.focus()
  input.setSelectionRange(0, 5)

  fireEvent.contextMenu(input, { clientX: 20, clientY: 18 })

  expect(screen.getByRole('menuitem', { name: '复制' })).toBeInTheDocument()
  input.remove()
})

test('closes the custom menu on escape and outside pointer down', () => {
  const host = document.createElement('p')
  host.textContent = '可复制'
  document.body.append(host)
  const range = document.createRange()
  range.selectNodeContents(host)
  window.getSelection()?.removeAllRanges()
  window.getSelection()?.addRange(range)
  render(<AppContextMenu />)

  fireEvent.contextMenu(host, { clientX: 10, clientY: 10 })
  expect(screen.getByRole('menu')).toBeInTheDocument()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('menu')).toBeNull()

  fireEvent.contextMenu(host, { clientX: 10, clientY: 10 })
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('menu')).toBeNull()
  host.remove()
})
