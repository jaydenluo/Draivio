import { useEffect, useState } from 'react'
import { useDocumentWorkspace } from './DocumentWorkspaceProvider'
import './documentTabs.css'

export function DocumentTabs() {
  const workspace = useDocumentWorkspace()
  const [pending, setPending] = useState<string | null>(null)
  const tabs = workspace?.tabs ?? []
  const activeId = workspace?.activeId ?? ''
  const activate = workspace?.activate
  const create = workspace?.create
  const close = workspace?.close
  useEffect(() => {
    if (!workspace) return
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      const key = event.key.toLowerCase()
      if (key === 'n') { event.preventDefault(); create?.() }
      if (key === 'tab') { event.preventDefault(); const index = tabs.findIndex(tab => tab.id === activeId); const next = tabs[(index + (event.shiftKey ? -1 : 1) + tabs.length) % tabs.length]; if (next) activate?.(next.id) }
      if (key === 'w') { event.preventDefault(); const current = tabs.find(tab => tab.id === activeId); if (current?.dirty) setPending(activeId); else close?.() }
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [workspace, tabs, activeId, activate, create, close])
  if (!workspace) return null
  return <><div className="document-tabs" role="tablist" aria-label="打开的文档"><div className="document-tabs-scroll">{tabs.map(tab => <div className={`document-tab${tab.id === activeId ? ' is-active' : ''}`} key={tab.id} role="tab" aria-selected={tab.id === activeId}><button onClick={() => activate?.(tab.id)}>{tab.name}{tab.dirty ? ' ·' : ''}</button><button aria-label={`关闭 ${tab.name}`} onClick={() => tab.dirty ? setPending(tab.id) : close?.(tab.id)}>×</button></div>)}</div><button className="document-tab-new" aria-label="新建文档" onClick={() => create?.()}>＋</button></div>{pending ? <div className="project-switch-backdrop"><section role="dialog" aria-modal="true" aria-label="关闭未保存文档"><h2>保存当前作品？</h2><p>关闭前请选择如何处理未保存修改。</p><div><button onClick={() => setPending(null)}>取消关闭</button><button onClick={() => { close?.(pending, true); setPending(null) }}>放弃修改并关闭</button><button onClick={() => { const id = pending; setPending(null); activate?.(id); setTimeout(() => window.dispatchEvent(new CustomEvent('draivio:request-save-and-close', { detail: { documentId: id } })), 0) }}>保存并关闭</button></div></section></div> : null}</>
}
