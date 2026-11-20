import { useRef, type HTMLAttributes, type ReactNode, type RefObject } from 'react'
import { DialogTitlebar } from './DialogTitlebar'
import { useDraggableDialog } from './useDraggableDialog'

/** Reusable non-modal floating window; its caller owns open/close state. */
export function FloatingSurface({ title, onClose, closeLabel, surfaceRef, reanchorOnResize, children, className = '', style, onPointerDown, onKeyDown, ...props }: HTMLAttributes<HTMLDivElement> & { title: ReactNode; onClose: () => void; closeLabel?: string; surfaceRef?: RefObject<HTMLDivElement | null>; reanchorOnResize?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const draggable = useDraggableDialog(root, true, reanchorOnResize)
  return <div {...props} ref={element => { root.current = element; if (surfaceRef) surfaceRef.current = element }} className={`floating-dialog-surface ${className}`} style={{ ...style, ...draggable.style }} onPointerDown={event => { if (!event.currentTarget.contains(event.target as Node)) return; draggable.onPointerDown(event); onPointerDown?.(event) }} onKeyDown={event => { if (!event.currentTarget.contains(event.target as Node)) return; onKeyDown?.(event); if (!event.defaultPrevented && event.key === 'Escape') { event.stopPropagation(); onClose() } }}><DialogTitlebar title={title} onClose={onClose} closeLabel={closeLabel} />{children}</div>
}
