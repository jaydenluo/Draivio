import { useRef, type HTMLAttributes, type ReactNode } from 'react'
import { DialogTitlebar } from './DialogTitlebar'
import { useDraggableDialog } from './useDraggableDialog'

/** Reusable non-modal floating window; its caller owns open/close state. */
export function FloatingSurface({ title, onClose, closeLabel, children, className = '', style, onPointerDown, onKeyDown, ...props }: HTMLAttributes<HTMLDivElement> & { title: ReactNode; onClose: () => void; closeLabel?: string }) {
  const root = useRef<HTMLDivElement>(null)
  const draggable = useDraggableDialog(root)
  return <div {...props} ref={root} className={`floating-dialog-surface ${className}`} style={{ ...style, ...draggable.style }} onPointerDown={event => { draggable.onPointerDown(event); onPointerDown?.(event) }} onKeyDown={event => { onKeyDown?.(event); if (!event.defaultPrevented && event.key === 'Escape') { event.stopPropagation(); onClose() } }}><DialogTitlebar title={title} onClose={onClose} closeLabel={closeLabel} />{children}</div>
}
