import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { AppShell } from '../app/AppShell'
import { EditorProvider } from '../state/editor'

function setup() {
  const view = render(<EditorProvider><AppShell /></EditorProvider>)
  vi.spyOn(view.container.querySelector('.artboard')!, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 500, height: 625, right: 500, bottom: 625, x: 0, y: 0, toJSON: () => ({}) })
  return screen.getByLabelText('画布交互层')
}

test('freehand lasso closes on release and creates an irregular selection', () => {
  const target = setup()
  fireEvent.keyDown(window, { key: 'l' })
  fireEvent.pointerDown(target, { pointerId: 1, clientX: 50, clientY: 60, buttons: 1 })
  fireEvent.pointerMove(target, { pointerId: 1, clientX: 350, clientY: 100, buttons: 1 })
  fireEvent.pointerMove(target, { pointerId: 1, clientX: 200, clientY: 400, buttons: 1 })
  fireEvent.pointerUp(target, { pointerId: 1, clientX: 50, clientY: 60 })
  expect(screen.getByLabelText('局部选区')).toHaveAttribute('data-selection-kind', 'path')
  expect(document.querySelector('.selection-geometry mask path')).toHaveAttribute('d', expect.stringContaining('Z'))
})

test('polygon can be closed with Enter and explicitly converted to a selection', () => {
  const target = setup()
  fireEvent.click(screen.getByRole('button', { name: '打开工具组菜单：选区' }))
  fireEvent.click(screen.getByRole('menuitem', { name: /多边形套索/ }))
  for (const [x, y] of [[50, 60], [350, 100], [200, 400]]) {
    fireEvent.pointerDown(target, { pointerId: 2, clientX: x, clientY: y, buttons: 1 })
    fireEvent.pointerUp(target, { pointerId: 2, clientX: x, clientY: y })
  }
  fireEvent.keyDown(window, { key: 'Enter' })
  expect(screen.getByLabelText('已闭合路径')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '路径转为选区' }))
  expect(screen.getByLabelText('局部选区')).toHaveAttribute('data-selection-kind', 'path')
  expect(screen.queryByLabelText('已闭合路径')).not.toBeInTheDocument()
})
