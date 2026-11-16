import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import '../styles/service-settings.css'
import { useDraggableDialog } from '../ui/useDraggableDialog'

const dialogStack: HTMLElement[] = []
let originalOverflow = ''

export function SettingsDialog({ label, onClose, children, variant = 'modal', inactive = false, className = '' }: { label: string; onClose: () => void; children: ReactNode; variant?: 'modal' | 'drawer'; inactive?: boolean; className?: string }) {
  const root = useRef<HTMLDivElement>(null)
  const draggable = useDraggableDialog(root, label + variant)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const element = root.current!
    if (!dialogStack.length) { originalOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden' }
    dialogStack.push(element)
    element.focus()
    const keydown = (event: KeyboardEvent) => {
      if (dialogStack.at(-1) !== element) return
      if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); onClose() }
      if (event.key !== 'Tab') return
      const items = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], summary') ?? [])].filter(item => !item.closest('details:not([open])') || item.tagName === 'SUMMARY')
      if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && (document.activeElement === last || document.activeElement === root.current)) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keydown, true)
    return () => {
      const index = dialogStack.indexOf(element)
      if (index >= 0) dialogStack.splice(index, 1)
      if (!dialogStack.length) document.body.style.overflow = originalOverflow
      document.removeEventListener('keydown', keydown, true)
      if (previous?.isConnected && previous !== document.body && (!dialogStack.length || dialogStack.at(-1)?.contains(previous))) previous.focus()
      else if (dialogStack.length) dialogStack.at(-1)?.focus()
      else document.querySelector<HTMLButtonElement>('button[aria-label="账户设置"]')?.focus()
    }
  }, [onClose])
  return createPortal(<div className={`service-settings-backdrop${variant === 'drawer' ? ' service-settings-backdrop--drawer' : ''}`} onPointerDown={event => { event.stopPropagation(); if (event.target === event.currentTarget && !inactive && dialogStack.at(-1) === root.current) onClose() }}>
    <div className={`service-settings${variant === 'drawer' ? ' service-settings--drawer' : ''} ${className}`} style={draggable.style} onPointerDown={draggable.onPointerDown} role="dialog" aria-hidden={inactive || undefined} inert={inactive || undefined} aria-modal={!inactive} aria-label={label} tabIndex={-1} ref={root}>{children}</div>
  </div>, document.body)
}
