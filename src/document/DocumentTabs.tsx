import { formatShortcut, shortcutFor, useShortcutVersion } from '../commands/shortcuts'
import { useEffect, useRef, useState } from 'react'
import { useDocumentWorkspace } from './DocumentWorkspaceProvider'
import { documentIsDirty } from './documentWorkspace'

export function focusActiveDocumentTab() {
  requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.document-tabs [aria-selected="true"]')?.focus({ preventScroll: true }))
}

export function DocumentTabs() {
  const { workspace, dispatchWorkspace, newDocument, requestClose, busyIds } = useDocumentWorkspace()
  useShortcutVersion()
  const [renaming, setRenaming] = useState<{id:string;name:string}|null>(null)
  const commitName = () => { if(renaming) dispatchWorkspace({type:'rename',id:renaming.id,name:renaming.name.trim() || '未命名作品'}); setRenaming(null) }
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [workspace.activeId])
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || list.scrollWidth <= list.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
      list.scrollLeft += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? list.clientWidth : 1)
      event.preventDefault()
    }
    list.addEventListener('wheel', wheel, { passive: false })
    return () => list.removeEventListener('wheel', wheel)
  }, [])
  return <div className="document-tabs-bar"><div ref={listRef} className="document-tabs" role="tablist" aria-label="打开的文档" onKeyDown={event => {
    if ((event.target as HTMLElement).matches('input')) return
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const index = workspace.documents.findIndex(document => document.id === workspace.activeId)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? workspace.documents.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + workspace.documents.length) % workspace.documents.length
    dispatchWorkspace({ type: 'activate', id: workspace.documents[next].id })
    focusActiveDocumentTab()
  }}>{workspace.documents.map(document => <div key={document.id} className={`document-tab${document.id === workspace.activeId ? ' is-active' : ''}`}>
    {renaming?.id === document.id ? <input autoFocus aria-label="重命名文档" value={renaming.name} maxLength={100} onChange={event=>setRenaming({...renaming,name:event.target.value})} onBlur={commitName} onKeyDown={event=>{event.stopPropagation();if(event.key==='Enter'){event.preventDefault();commitName()}if(event.key==='Escape'){event.preventDefault();setRenaming(null)}}}/> : <button type="button" role="tab" aria-selected={document.id === workspace.activeId} tabIndex={document.id === workspace.activeId ? 0 : -1} aria-controls="active-document-panel" onDoubleClick={()=>setRenaming({id:document.id,name:document.metadata.name})} title={`${document.metadata.name} · ${document.state.documentWidth} × ${document.state.documentHeight} px`} onClick={() => { dispatchWorkspace({ type: 'activate', id: document.id }); focusActiveDocumentTab() }}><span className="document-tab-name">{document.metadata.name || '未命名作品'}</span>{documentIsDirty(document) ? <span className="document-tab-dirty" aria-label="未保存">•</span> : null}{document.state.isGenerating || busyIds.has(document.id) ? <span className="document-tab-working" aria-label="处理中">◌</span> : null}</button>}
    <button type="button" className="document-tab-close" aria-label={`关闭文档：${document.metadata.name || '未命名作品'}`} onClick={() => requestClose(document.id)}>×</button>
  </div>)}</div><button type="button" className="document-tab-add" aria-label="新建文档标签" title={`新建文档 · ${formatShortcut(shortcutFor('new'))}`} onClick={() => newDocument()}>＋</button></div>
}
