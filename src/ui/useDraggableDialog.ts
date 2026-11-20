import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import './dialog.css'

type Position = { x: number; y: number }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(Math.max(min, max), value))

/** Shared header-only dragging. CSS translate preserves existing centering transforms. */
export function useDraggableDialog(root: RefObject<HTMLElement | null>, resetKey: unknown = true, reanchorOnResize = false) {
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 })
  const positionRef = useRef(position)
  const drag = useRef<{ pointerId: number; pointerX: number; pointerY: number; x: number; y: number; left: number; top: number; width: number; height: number } | null>(null)
  const change = (next: Position) => { positionRef.current = next; setPosition(next) }
  useEffect(() => { change({ x: 0, y: 0 }); drag.current = null }, [resetKey])
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const start = drag.current
      if (!start || event.pointerId !== start.pointerId) return
      change({
        x: clamp(start.x + event.clientX - start.pointerX, 8 - start.left, window.innerWidth - 8 - start.width - start.left),
        y: clamp(start.y + event.clientY - start.pointerY, 8 - start.top, window.innerHeight - 8 - Math.min(start.height, window.innerHeight - 16) - start.top),
      })
    }
    const stop = (event: PointerEvent) => { if (event.pointerId === drag.current?.pointerId) drag.current = null }
    const blur = () => { drag.current = null }
    const resize = () => {
      drag.current = null
      if (reanchorOnResize) {
        change({ x: 0, y: 0 })
        return
      }
      const rect = root.current?.getBoundingClientRect()
      if (!rect) return
      const current = positionRef.current
      change({ x: current.x + clamp(rect.left, 8, window.innerWidth - rect.width - 8) - rect.left, y: current.y + clamp(rect.top, 8, window.innerHeight - Math.min(rect.height, window.innerHeight - 16) - 8) - rect.top })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    window.addEventListener('blur', blur)
    window.addEventListener('resize', resize)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); window.removeEventListener('blur', blur); window.removeEventListener('resize', resize) }
  }, [root, reanchorOnResize])

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !(event.target instanceof Element) || drag.current) return
    const anchored = root.current?.closest('.composer-anchored-popover')
    if (anchored && anchored !== root.current) return
    const target = event.target
    const handle = target.closest('header,[data-dialog-drag-handle]')
    if (!handle || !root.current?.contains(handle) || target.closest('button,input,select,textarea,a,label,[contenteditable="true"],[role="slider"]')) return
    const rect = root.current.getBoundingClientRect()
    const current = positionRef.current
    drag.current = { pointerId: event.pointerId, pointerX: event.clientX, pointerY: event.clientY, ...current, left: rect.left - current.x, top: rect.top - current.y, width: rect.width, height: rect.height }
    root.current.setPointerCapture?.(event.pointerId)
    event.preventDefault()
    event.stopPropagation()
  }
  return { position, style: { translate: `${position.x}px ${position.y}px` }, onPointerDown }
}
