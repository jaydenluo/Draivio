import type { ReactNode } from 'react'
import './dialog.css'

export function DialogTitlebar({ title, onClose, closeLabel = `关闭${typeof title === 'string' ? title : '窗口'}`, disabled = false }: { title: ReactNode; onClose: () => void; closeLabel?: string; disabled?: boolean }) {
  return <header className="dialog-titlebar" data-dialog-drag-handle><strong>{title}</strong><button type="button" className="dialog-close" aria-label={closeLabel} title="关闭" disabled={disabled} onClick={onClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></header>
}
