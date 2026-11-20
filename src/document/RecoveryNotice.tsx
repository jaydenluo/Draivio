import { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DialogTitlebar } from '../ui/DialogTitlebar'
import { useDraggableDialog } from '../ui/useDraggableDialog'
import './recoveryNotice.css'

type RecoveryDocument = { id: string; name: string; width: number; height: number }
type Props = { documents: RecoveryDocument[]; onRestore: () => void; onDiscard: () => void }

function RecoveryIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 9M4 5v5h5M12 8v5l3 2" /></svg>
}

/** A persistent recovery choice that stays outside the editor's layout. */
export function RecoveryNotice({ documents, onRestore, onDiscard }: Props) {
  const [view, setView] = useState<'expanded' | 'collapsed' | 'confirm-discard'>('expanded')
  const root = useRef<HTMLElement>(null)
  const draggable = useDraggableDialog(root, view === 'collapsed')
  const entryRef = useRef<HTMLButtonElement>(null)
  const restoreRef = useRef<HTMLButtonElement>(null)
  const keepRef = useRef<HTMLButtonElement>(null)
  const focusRequested = useRef(false)
  const descriptionId = useId()
  const show = (next: typeof view) => { focusRequested.current = true; setView(next) }
  useLayoutEffect(() => {
    if (!focusRequested.current) return
    focusRequested.current = false
    const target = view === 'collapsed' ? entryRef : view === 'confirm-discard' ? keepRef : restoreRef
    target.current?.focus({ preventScroll: true })
  }, [view])

  return createPortal(view === 'collapsed' ? <button ref={entryRef} type="button" className="recovery-notice-entry" aria-label={`查看待恢复的 ${documents.length} 个文档`} aria-expanded="false" onClick={() => show('expanded')}><RecoveryIcon /><span>{documents.length} 个文档待恢复</span><span aria-hidden="true">›</span></button> : <section ref={root} style={draggable.style} onPointerDown={draggable.onPointerDown} className="recovery-notice" role="dialog" aria-modal="false" aria-label="恢复编辑" aria-describedby={descriptionId} onKeyDown={event => {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation()
      show(view === 'confirm-discard' ? 'expanded' : 'collapsed')
    }
  }}>
    <DialogTitlebar title={<span className="recovery-notice-heading"><span className="recovery-notice-icon"><RecoveryIcon /></span>恢复上次编辑</span>} closeLabel="收起恢复提示" onClose={() => show('collapsed')} />
    {view === 'confirm-discard' ? <>
      <p className="recovery-notice-title">丢弃这些恢复副本？</p>
      <p className="recovery-notice-description" id={descriptionId}>将清除这 {documents.length} 个文档的恢复记录，已保存的项目文件不受影响。</p>
      <footer className="recovery-notice-actions"><button ref={keepRef} type="button" className="recovery-notice-secondary" onClick={() => show('expanded')}>保留副本</button><button type="button" className="recovery-notice-danger" onClick={onDiscard}>确认丢弃</button></footer>
    </> : <>
      <p className="recovery-notice-title">发现 {documents.length} 个未关闭文档</p>
      <p className="recovery-notice-description" id={descriptionId}>恢复后可继续编辑，请重新保存项目文件。</p>
      <ul className="recovery-notice-documents">{documents.slice(0, 3).map(document => <li key={document.id}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" aria-hidden="true"><path d="M4 2h5l3 3v9H4zM9 2v4h3" /></svg><span title={document.name}>{document.name}</span><small>{document.width} × {document.height}</small></li>)}</ul>
      {documents.length > 3 ? <p className="recovery-notice-more">另有 {documents.length - 3} 个文档</p> : null}
      <footer className="recovery-notice-actions"><button type="button" className="recovery-notice-discard" onClick={() => show('confirm-discard')}>丢弃</button><button type="button" className="recovery-notice-secondary" onClick={() => show('collapsed')}>稍后</button><button ref={restoreRef} type="button" className="recovery-notice-primary" onClick={onRestore}>恢复副本</button></footer>
    </>}
  </section>, document.body)
}
