import { useCallback, useEffect, useRef, useState } from 'react'
import { useDocumentWorkspace } from './DocumentWorkspaceProvider'
import { documentIsDirty } from './documentWorkspace'
import { hasProjectPicker, openProjectFile } from './projectStorage'
import { message } from '../ui/message'
import './projectFiles.css'

export function ProjectFileControl() {
  const { workspace, dispatchWorkspace, busyIds, newDocument, openSerialized, saveDocument } = useDocumentWorkspace()
  const document = workspace.documents.find(item => item.id === workspace.activeId)!
  const picker = useRef<HTMLInputElement>(null)
  const [opening, setOpening] = useState(false)
  const openingRef = useRef(false)
  const activeId = useRef(document.id); activeId.current = document.id
  const busy = opening || busyIds.has(document.id)
  const open = useCallback(async () => {
    if (openingRef.current) return
    if (!hasProjectPicker()) { picker.current?.click(); return }
    openingRef.current = true; setOpening(true)
    try { const file = await openProjectFile(); if (file) openSerialized(file.text, file.location) }
    catch (error) { message.error(error instanceof Error ? error.message : '项目打开失败，当前作品已保留') }
    finally { openingRef.current = false; setOpening(false) }
  }, [openSerialized])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || !(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() === 's') { event.preventDefault(); void saveDocument(activeId.current, event.shiftKey) }
      if (event.key.toLowerCase() === 'o') { event.preventDefault(); void open() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open, saveDocument])
  const dirty = documentIsDirty(document)
  return <div className="project-files">
    <label className="project-name"><span className="sr-only">项目名称</span><input aria-label="项目名称" value={document.metadata.name} maxLength={100} onChange={event => dispatchWorkspace({ type: 'rename', id: document.id, name: event.target.value })} /></label>
    <span className={`project-save-state${dirty ? ' is-dirty' : ''}`} aria-label={dirty ? '有未保存修改' : '已保存'}>{busy ? '处理中…' : dirty ? '未保存' : '已保存'}</span>
    <button className="top-button" onClick={() => newDocument()}>新建</button>
    <button className="top-button" disabled={opening} onClick={() => void open()}>打开</button>
    <button className="top-button" disabled={busy} onClick={() => void saveDocument(document.id)}>保存</button>
    <button className="top-button project-save-as" disabled={busy} onClick={() => void saveDocument(document.id, true)}>另存为</button>
    <input ref={picker} type="file" multiple accept=".draivio,application/json" className="sr-only" aria-label="打开 Draivio 项目" onChange={async event => {
      const files = Array.from(event.target.files ?? []); event.target.value = ''
      for (const file of files) {
        try { if (file.size > 256 * 1024 * 1024) throw new Error('项目文件超过 256MB'); openSerialized(await file.text(), { name: file.name }) }
        catch (error) { message.error(error instanceof Error ? error.message : '项目文件无法读取') }
      }
    }} />
  </div>
}
