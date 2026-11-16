import { useRef, useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { useDraggableDialog } from './useDraggableDialog'

function Window() {
  const root = useRef<HTMLDivElement>(null)
  const draggable = useDraggableDialog(root)
  const [closed, setClosed] = useState(false)
  if (closed) return null
  return <div ref={root} role="dialog" style={draggable.style} onPointerDown={draggable.onPointerDown}><header><span>窗口标题</span><button aria-label="关闭窗口" onClick={() => setClosed(true)}><svg><path d="M0 0" /></svg></button></header><input aria-label="内容" /></div>
}
const start = () => fireEvent.pointerDown(screen.getByText('窗口标题'), { clientX: 200, clientY: 120, pointerId: 1, button: 0 })

test('keeps the entire window inside viewport when dragged far outside', () => {
  render(<Window />)
  const root = screen.getByRole('dialog')
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 100, right: 400, bottom: 300, width: 300, height: 200, x: 100, y: 100, toJSON: () => ({}) })
  start()
  fireEvent.pointerMove(window, { clientX: -2000, clientY: -2000, pointerId: 1 })
  expect(root.style.translate).toBe('-92px -92px')
  fireEvent.pointerMove(window, { clientX: 4000, clientY: 4000, pointerId: 1 })
  expect(root.style.translate).toBe(`${window.innerWidth - 408}px ${window.innerHeight - 308}px`)
})

test('ignores form controls, secondary pointers and right clicks; cancel stops movement', () => {
  render(<Window />)
  const root = screen.getByRole('dialog')
  start()
  fireEvent.pointerMove(window, { clientX: 260, clientY: 160, pointerId: 2 })
  expect(root.style.translate).toBe('0px')
  fireEvent.pointerCancel(window, { pointerId: 1 })
  fireEvent.pointerMove(window, { clientX: 260, clientY: 160, pointerId: 1 })
  expect(root.style.translate).toBe('0px')
  fireEvent.pointerDown(screen.getByText('窗口标题'), { clientX: 200, clientY: 120, pointerId: 1, button: 2 })
  fireEvent.pointerMove(window, { clientX: 260, clientY: 160, pointerId: 1 })
  expect(root.style.translate).toBe('0px')
  fireEvent.click(screen.getByRole('button', { name: '关闭窗口' }).querySelector('path')!)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
