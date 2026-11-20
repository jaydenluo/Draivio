import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { AnchoredWindow } from '../ui/AnchoredWindow'

/** Both enhancement tools use the same viewport layer and rail anchoring. */
export function EnhancementWindow({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const anchor = useRef<HTMLElement | null>(null)
  const [ready, setReady] = useState(false)
  useLayoutEffect(() => {
    anchor.current = document.querySelector<HTMLElement>(`.tool-rail [aria-label="工具组：${title}"]`)
    setReady(true)
  }, [title])
  return ready ? <AnchoredWindow anchor={anchor} title={title} label={`${title}窗口`} onClose={onClose} width={386} placement="right" className="enhancement-window">{children}</AnchoredWindow> : null
}
