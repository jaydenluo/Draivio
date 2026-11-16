import { useDraggableDialog } from '../ui/useDraggableDialog'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function ComposerPopover({ anchor, width, preferBelow, onClose, children }: {
  anchor: HTMLElement
  width: number
  preferBelow: boolean
  onClose: () => void
  children: ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)
  const draggable = useDraggableDialog(root)
  const [position, setPosition] = useState({ left: 12, top: 12, width, maxHeight: 440, side: 'top' })

  useLayoutEffect(() => {
    const update = () => {
      const rect = anchor.getBoundingClientRect()
      const popupWidth = Math.min(width, Math.max(0, window.innerWidth - 24))
      const above = Math.max(0, rect.top - 20)
      const below = Math.max(0, window.innerHeight - rect.bottom - 20)
      const height = Math.min(root.current?.scrollHeight || 440, 440)
      const useBelow = preferBelow ? below >= height || below >= above : above < height && below > above
      const maxHeight = Math.min(440, useBelow ? below : above)
      const top = useBelow ? rect.bottom + 8 : rect.top - 8 - Math.min(height, maxHeight)
      const next = { left: Math.max(12, Math.min(rect.left, window.innerWidth - popupWidth - 12)), top: Math.max(12, top), width: popupWidth, maxHeight, side: useBelow ? 'bottom' : 'top' }
      setPosition((previous) => Object.keys(next).every((key) => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next)
    }
    update()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    if (root.current) observer?.observe(root.current)
    observer?.observe(anchor)
    const composer = anchor.closest('.ai-composer')
    if (composer) observer?.observe(composer)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchor, width, preferBelow, children])

  useLayoutEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target) && !anchor.contains(event.target)) onClose()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
      anchor.focus()
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', escape, true)
    }
  }, [anchor, onClose])

  const { side, ...style } = position
  return createPortal(<div ref={root} className="composer-anchored-popover" onPointerDown={draggable.onPointerDown} data-side={side} style={{ ...style, ...draggable.style, position: 'fixed' }}>{children}</div>, document.body)
}
