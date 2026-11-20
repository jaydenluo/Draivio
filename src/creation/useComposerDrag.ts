import { useEffect, useRef, useState, type PointerEvent, type CSSProperties } from 'react'
import { constrainComposerPosition, type ComposerPosition } from './composerPosition'

export function useComposerDrag(enabled: boolean) {
  const ref = useRef<HTMLElement>(null)
  const [position, setPosition] = useState<ComposerPosition | null>(null)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ pointerId: number; x: number; y: number; left: number; top: number; original: ComposerPosition | null } | null>(null)
  const constrain = (x: number, y: number) => {
    const box = ref.current, parent = box?.parentElement
    if (!box || !parent) return null
    const reservedWidth = Number.parseFloat(getComputedStyle(parent).getPropertyValue('--composer-right-reserve')) || 0
    return constrainComposerPosition({ x, y }, { width: parent.clientWidth - reservedWidth, height: parent.clientHeight }, { width: box.offsetWidth, height: box.offsetHeight })
  }
  useEffect(() => {
    const box = ref.current, parent = box?.parentElement
    if (!enabled || !box || !parent) return
    const resize = () => setPosition(previous => previous ? constrain(previous.x, previous.snapped ? Number.MAX_SAFE_INTEGER : previous.y) : previous)
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', resize)
      return () => window.removeEventListener('resize', resize)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(parent); observer.observe(box)
    return () => observer.disconnect()
  }, [enabled])
  const onPointerDown = (event: PointerEvent) => {
    if (!enabled || event.button !== 0 || (event.target as HTMLElement).closest('button, input, textarea, select, a')) return
    const box = ref.current, parent = box?.parentElement
    if (!box || !parent) return
    const bounds = box.getBoundingClientRect(), container = parent.getBoundingClientRect()
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: bounds.left - container.left, top: bounds.top - container.top, original: position }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    event.preventDefault(); event.stopPropagation(); setDragging(true)
  }
  const onPointerMove = (event: PointerEvent) => {
    const start = drag.current
    if (!start || start.pointerId !== event.pointerId) return
    setPosition(constrain(start.left + event.clientX - start.x, start.top + event.clientY - start.y))
    event.stopPropagation()
  }
  const onPointerUp = () => { drag.current = null; setDragging(false) }
  const onPointerCancel = () => { if (drag.current) setPosition(drag.current.original); onPointerUp() }
  const style: CSSProperties | undefined = enabled && position ? { left: position.x, top: position.y, bottom: 'auto', transform: 'none' } : undefined
  return { ref, style, dragging, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onLostPointerCapture: onPointerUp } }
}
