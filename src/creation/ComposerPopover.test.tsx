import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { AppShell } from '../app/AppShell'
import { EditorProvider } from '../state/editor'

afterEach(() => vi.restoreAllMocks())

test('anchors each composer menu to its own trigger and follows viewport changes', () => {
  let shift = 0
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const left = (this.getAttribute('aria-label') === '选择数量' ? 420 : 220) + shift
    return { left, right: left + 80, top: 600, bottom: 630, width: 80, height: 30, x: left, y: 600, toJSON() {} }
  })
  render(<EditorProvider><AppShell /></EditorProvider>)
  fireEvent.click(screen.getByRole('button', { name: '选择数量' }))
  expect(screen.getByRole('dialog', { name: '其他参数' }).parentElement).toHaveStyle({ position: 'fixed', left: '420px' })
  fireEvent.click(screen.getByRole('button', { name: '选择比例与分辨率' }))
  expect(screen.getByRole('dialog', { name: '比例与分辨率' }).parentElement).toHaveStyle({ left: '220px' })
  shift = 40
  fireEvent.resize(window)
  expect(screen.getByRole('dialog', { name: '比例与分辨率' }).parentElement).toHaveStyle({ left: '260px' })
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '选择比例与分辨率' })).toHaveFocus()
})

test('keeps menus within the viewport and dismisses on outside pointer down', () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 1010, right: 1090, top: 10, bottom: 40, width: 80, height: 30, x: 1010, y: 10, toJSON() {} })
  render(<EditorProvider><AppShell /></EditorProvider>)
  fireEvent.click(screen.getByRole('button', { name: '选择数量' }))
  const popup = screen.getByRole('dialog', { name: '其他参数' }).parentElement!
  expect(parseFloat(popup.style.left) + parseFloat(popup.style.width)).toBeLessThanOrEqual(window.innerWidth - 12)
  expect(popup).toHaveAttribute('data-side', 'bottom')
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})


test('选择数量 opens a draggable window with a title and close button', () => {
  render(<EditorProvider><AppShell /></EditorProvider>)
  fireEvent.click(screen.getByRole('button', { name: '选择数量' }))
  const dialog = screen.getByRole('dialog')
  const surface = dialog.closest<HTMLElement>('.composer-anchored-popover')!
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left:200, top:100, right:500, bottom:300, width:300, height:200, x:200, y:100, toJSON() {} })
  const header = dialog.querySelector('header')!
  expect(header).toBeInTheDocument()
  fireEvent.pointerDown(header, { pointerId:1, button:0, clientX:230, clientY:120 })
  fireEvent.pointerMove(window, { pointerId:1, clientX:280, clientY:150 })
  fireEvent.pointerUp(window, { pointerId:1 })
  expect(surface.style.translate).toBe('50px 30px')
  fireEvent.click(within(header).getByRole('button', {name:/关闭/}))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
