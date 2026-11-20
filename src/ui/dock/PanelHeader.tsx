import { createContext, useContext, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Stable header hosts follow the same panel across docking and tab switches. */
export const PanelHeaderTarget = createContext<{
  host: HTMLElement
  reveal: () => void
  startDrag: (event: MouseEvent | PointerEvent) => void
} | null>(null)

export function PanelHeader({ title, children, className = '' }: { title: string; children?: ReactNode; className?: string }) {
  const target = useContext(PanelHeaderTarget)
  if (target) return createPortal(<div className="dock-panel-header-content" onPointerDown={target.startDrag} onMouseDown={target.startDrag} onClickCapture={event => {
    if ((event.target as Element).closest('button,input,select,textarea,a,[role="button"]')) target.reveal()
  }}>{children}</div>, target.host)
  return <div className={`panel-heading ${className}`}><h2>{title}</h2>{children}</div>
}
