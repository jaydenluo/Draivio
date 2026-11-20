import { COMMAND_EVENT, matchesFileShortcut, isShortcutTextTarget, shortcutFor, formatShortcut, useShortcutVersion } from '../commands/shortcuts'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDocumentWorkspace } from './DocumentWorkspaceProvider'
import { documentIsDirty } from './documentWorkspace'
import { hasProjectPicker, openProjectFile,readBrowserProjectFile } from './projectStorage'
import { message } from '../ui/message'
import './projectFiles.css'

export function ProjectFileControl({ compact = false }: { compact?: boolean }) {
  useShortcutVersion()
  const { workspace, dispatchWorkspace, busyIds, newDocument, openPickedProject, saveDocument } = useDocumentWorkspace()
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
    try { const file = await openProjectFile(); if (file) await openPickedProject(file) }
    catch (error) { message.error(error instanceof Error ? error.message : '项目打开失败，当前作品已保留') }
    finally { openingRef.current = false; setOpening(false) }
  }, [openPickedProject])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat || (!(event.metaKey || event.ctrlKey) && (isShortcutTextTarget(event.target) || isShortcutTextTarget(globalThis.document.activeElement))) || globalThis.document.querySelector('[role="dialog"][aria-modal="true"]')) return
      if (matchesFileShortcut(event, 'save') || matchesFileShortcut(event, 'saveAs')) { event.preventDefault(); void saveDocument(activeId.current, matchesFileShortcut(event, 'saveAs')) }
      if (matchesFileShortcut(event, 'open')) { event.preventDefault(); void open() }
    }
    const command = (event: Event) => { const id = (event as CustomEvent<string>).detail; if (id === 'open') void open(); if (id === 'save' || id === 'saveAs') void saveDocument(activeId.current, id === 'saveAs') }
    window.addEventListener(COMMAND_EVENT, command)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener(COMMAND_EVENT, command) }
  }, [open, saveDocument])
  const dirty = documentIsDirty(document)
  return <div className="project-files">
    {!compact ? <label className="project-name"><span className="sr-only">项目名称</span><input aria-label="项目名称" value={document.metadata.name} maxLength={100} onChange={event => dispatchWorkspace({ type: 'rename', id: document.id, name: event.target.value })} /></label> : null}
    {!compact ? <span className={`project-save-state${dirty ? ' is-dirty' : ''}`} aria-label={dirty ? '有未保存修改' : '已保存'}>{busy ? '处理中…' : dirty ? '未保存' : '已保存'}</span> : null}
    <button className="top-button quick-action-secondary" title={`新建 ${formatShortcut(shortcutFor('new'))}`} onClick={() => newDocument()}>新建</button>
    <button className="top-button quick-action-secondary" title={`打开 ${formatShortcut(shortcutFor('open'))}`} disabled={opening} onClick={() => void open()}>打开</button>
    <button className="top-button" title={`保存 ${formatShortcut(shortcutFor('save'))}`} disabled={busy} onClick={() => void saveDocument(document.id)}>保存</button>
    {!compact ? <button className="top-button project-save-as" title="桌面版升级另存为 v4 二进制项目，保留旧版本原文件" disabled={busy} onClick={() => void saveDocument(document.id, true)}>另存为</button> : null}
    <input ref={picker} type="file" multiple accept=".draivio,application/json" className="sr-only" aria-label="打开 Draivio 项目" onChange={async event => {
      const files = Array.from(event.target.files ?? []); event.target.value = ''
      for (const file of files) {
        try { await openPickedProject(await readBrowserProjectFile(file)) }
        catch (error) { message.error(error instanceof Error ? error.message : '项目文件无法读取') }
      }
    }} />
  </div>
}
