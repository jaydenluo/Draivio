import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { PathOverlay } from './PathOverlay'
import type { EditorPath } from './pathGeometry'
import { useState } from 'react'

const triangle: EditorPath = { kind: 'polygon', closed: true, anchors: [{ x: 10, y: 10 }, { x: 80, y: 10 }, { x: 30, y: 70 }] }

test('closed paths expose explicit conversion actions', () => {
  const select = vi.fn(), mask = vi.fn()
  render(<PathOverlay path={triangle} onChange={vi.fn()} toPoint={(x, y) => ({ x, y })} onConvert={select} onMask={mask} />)
  fireEvent.click(screen.getByRole('button', { name: '路径转为选区' }))
  fireEvent.click(screen.getByRole('button', { name: '路径创建蒙版' }))
  expect(select).toHaveBeenCalledOnce()
  expect(mask).toHaveBeenCalledOnce()
})

test('a bezier control handle can be moved without moving its anchor', () => {
  const change = vi.fn()
  const path: EditorPath = { kind: 'bezier', closed: false, anchors: [{ x: 20, y: 20, out: { x: 30, y: 20 } }, { x: 80, y: 80 }] }
  render(<PathOverlay path={path} onChange={change} toPoint={(x, y) => ({ x, y })} onConvert={vi.fn()} onMask={vi.fn()} />)
  const handle = screen.getByRole('button', { name: '路径控制柄1-out' })
  fireEvent.pointerDown(handle, { pointerId: 1, clientX: 30, clientY: 20 })
  fireEvent.pointerMove(handle, { pointerId: 1, clientX: 40, clientY: 35 })
  expect(change.mock.lastCall?.[0].anchors[0]).toMatchObject({ x: 20, y: 20, out: { x: 40, y: 35 } })
})

test('dragging the first anchor keeps a path open until a separate click', () => {
  function Editor() {
    const [path, setPath] = useState({ ...triangle, closed: false })
    return <PathOverlay path={path} onChange={setPath} toPoint={(x, y) => ({ x, y })} onConvert={vi.fn()} onMask={vi.fn()} />
  }
  render(<Editor />)
  const first = screen.getByRole('button', { name: '路径锚点1' })
  fireEvent.pointerDown(first, { pointerId: 1, clientX: 10, clientY: 10 })
  fireEvent.pointerMove(first, { pointerId: 1, clientX: 20, clientY: 20 })
  fireEvent.pointerUp(first, { pointerId: 1, clientX: 20, clientY: 20 })
  fireEvent.click(first)
  expect(screen.getByLabelText('绘制中的路径')).toBeInTheDocument()
  expect(first).toHaveStyle({ left: '20%', top: '20%' })
  fireEvent.pointerDown(first, { pointerId: 2, clientX: 20, clientY: 20 })
  fireEvent.pointerUp(first, { pointerId: 2, clientX: 20, clientY: 20 })
  fireEvent.click(first)
  expect(screen.getByLabelText('已闭合路径')).toBeInTheDocument()
})
