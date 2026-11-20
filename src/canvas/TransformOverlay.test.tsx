import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { TransformOverlay, type TransformDraft } from './TransformOverlay'

const draft: TransformDraft = { kind: 'transform', rect: { x: 10, y: 10, width: 70, height: 70 }, rotation: 0, flipX: false, flipY: false }

test('transform has eight resize handles and real rotation/flip controls', () => {
  const change = vi.fn(), commit = vi.fn(), cancel = vi.fn()
  render(<TransformOverlay draft={draft} onChange={change} onCommit={commit} onCancel={cancel} toPoint={(x, y) => ({ x, y })} />)
  expect(screen.getAllByRole('button', { name: /^变换控制点/ })).toHaveLength(8)
  fireEvent.click(screen.getByRole('button', { name: '水平翻转' }))
  expect(change).toHaveBeenCalledWith({ ...draft, flipX: true })
  fireEvent.change(screen.getByRole('spinbutton', { name: '变换旋转角度' }), { target: { value: '30' } })
  expect(change).toHaveBeenCalledWith({ ...draft, rotation: 30 })
  fireEvent.click(screen.getByRole('button', { name: '确认变换' }))
  expect(commit).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: '取消变换' }))
  expect(cancel).toHaveBeenCalledOnce()
})

test('resizing a rotated east handle follows its visual axis and fixes the opposite edge', () => {
  const change = vi.fn()
  render(<TransformOverlay draft={{ ...draft, rotation: 90 }} onChange={change} onCommit={vi.fn()} onCancel={vi.fn()} toPoint={(x, y) => ({ x, y })} />)
  const east = screen.getByRole('button', { name: '变换控制点e' })
  fireEvent.pointerDown(east, { pointerId: 1, clientX: 0, clientY: 0 })
  fireEvent.pointerMove(east, { pointerId: 1, clientX: 0, clientY: 10 })
  const rect = change.mock.lastCall?.[0].rect
  expect(rect.width).toBeCloseTo(82.5)
  expect(rect.height).toBe(70)
  expect(rect.x).toBeCloseTo(3.75)
  expect(rect.y).toBeCloseTo(15)
})

test.each(['nw', 'ne', 'sw', 'se'])('Shift resizing %s keeps the opposite corner fixed', (handle) => {
  const change = vi.fn()
  render(<TransformOverlay draft={draft} onChange={change} onCommit={vi.fn()} onCancel={vi.fn()} toPoint={(x, y) => ({ x, y })} />)
  const corner = screen.getByRole('button', { name: `变换控制点${handle}` })
  fireEvent.pointerDown(corner, { pointerId: 1, clientX: 0, clientY: 0 })
  fireEvent.pointerMove(corner, { pointerId: 1, clientX: handle.includes('w') ? 10 : -10, clientY: 0, shiftKey: true })
  const rect = change.mock.lastCall?.[0].rect
  expect(rect.width).toBeCloseTo(60)
  expect(rect.height).toBeCloseTo(60)
  expect(rect.x).toBeCloseTo(handle.includes('w') ? 20 : 10)
  expect(rect.y).toBeCloseTo(handle.includes('n') ? 20 : 10)
})

test('Shift corner resizing responds to vertical movement', () => {
  const change = vi.fn()
  render(<TransformOverlay draft={draft} onChange={change} onCommit={vi.fn()} onCancel={vi.fn()} toPoint={(x, y) => ({ x, y })} />)
  const corner = screen.getByRole('button', { name: '变换控制点se' })
  fireEvent.pointerDown(corner, { pointerId: 1, clientX: 0, clientY: 0 })
  fireEvent.pointerMove(corner, { pointerId: 1, clientX: 0, clientY: 10, shiftKey: true })
  expect(change.mock.lastCall?.[0].rect).toEqual({ x: 10, y: 10, width: 80, height: 80 })
})

test('crop actions remain a draggable portal window and closing cancels', () => {
  const cancel = vi.fn(), change = vi.fn()
  const view = render(<TransformOverlay draft={{...draft, kind:'crop'}} onChange={change} onCommit={vi.fn()} onCancel={cancel} toPoint={(x,y)=>({x,y})} />)
  const window = screen.getByRole('dialog', {name:'变换参数'})
  expect(view.container).not.toContainElement(window)
  expect(document.body).toContainElement(window)
  vi.spyOn(window, 'getBoundingClientRect').mockReturnValue({left:200, top:100, width:330, height:140, right:530, bottom:240, x:200, y:100, toJSON(){}})
  const header = window.querySelector('header')!
  fireEvent.pointerDown(header, {pointerId:10, button:0, clientX:230, clientY:120})
  fireEvent.pointerMove(globalThis.window, {pointerId:10, clientX:280, clientY:150})
  fireEvent.pointerUp(globalThis.window, {pointerId:10})
  expect(window.style.translate).toBe('50px 30px')
  fireEvent.pointerDown(screen.getByLabelText('变换旋转角度'), {pointerId:11, button:0, clientX:280, clientY:180})
  fireEvent.pointerMove(globalThis.window, {pointerId:11, clientX:350, clientY:210})
  fireEvent.pointerUp(globalThis.window, {pointerId:11})
  expect(window.style.translate).toBe('50px 30px')
  fireEvent.click(screen.getByRole('button', {name:'关闭变换参数'}))
  expect(cancel).toHaveBeenCalledOnce()
})
