import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { useComposerDrag } from './useComposerDrag'

function Fixture() {
  const drag = useComposerDrag(true)
  return <div data-testid="container"><section ref={drag.ref} style={drag.style} data-testid="box"><div data-testid="handle" {...drag.handlers}><button>操作</button></div></section></div>
}
test('drags the header, snaps above controls, cancels safely, and ignores buttons', () => {
  vi.stubGlobal('PointerEvent', MouseEvent)
  render(<Fixture />)
  const box = screen.getByTestId('box'), parent = screen.getByTestId('container'), handle = screen.getByTestId('handle')
  Object.defineProperties(parent, { clientWidth: { value: 900 }, clientHeight: { value: 500 } })
  Object.defineProperties(box, { offsetWidth: { value: 700 }, offsetHeight: { value: 100 } })
  vi.spyOn(box, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 100 } as DOMRect)
  vi.spyOn(parent, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0 } as DOMRect)
  fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 100 })
  fireEvent.pointerMove(handle, { clientX: 80, clientY: 330 })
  fireEvent.pointerUp(handle)
  expect(box).toHaveStyle({ left: '80px', top: '344px' })
  fireEvent.pointerDown(screen.getByRole('button'), { button: 0, clientX: 0, clientY: 0 })
  fireEvent.pointerMove(handle, { clientX: 0, clientY: 0 })
  expect(box).toHaveStyle({ left: '80px', top: '344px' })
  fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 100 })
  fireEvent.pointerMove(handle, { clientX: 150, clientY: 180 })
  fireEvent.pointerCancel(handle)
  expect(box).toHaveStyle({ left: '80px', top: '344px' })
  vi.unstubAllGlobals()
})
