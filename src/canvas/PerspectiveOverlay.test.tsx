import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { PerspectiveOverlay, type PerspectiveQuad } from './PerspectiveOverlay'
test('perspective crop exposes four independent corners and explicit commit/cancel', () => {
  const quad: PerspectiveQuad = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
  const change = vi.fn(), commit = vi.fn(), cancel = vi.fn()
  render(<PerspectiveOverlay quad={quad} toPoint={(x,y) => ({x,y})} onChange={change} onCommit={commit} onCancel={cancel} />)
  const handle = screen.getByLabelText('透视控制点1')
  fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0, clientY: 0 })
  fireEvent.pointerMove(handle, { pointerId: 1, clientX: 15, clientY: 20 })
  fireEvent.pointerUp(handle, { pointerId: 1 })
  expect(change).toHaveBeenLastCalledWith([{x:15,y:20}, ...quad.slice(1)])
  fireEvent.click(screen.getByLabelText('确认透视裁剪')); expect(commit).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByLabelText('取消透视裁剪')); expect(cancel).toHaveBeenCalledOnce()
})
